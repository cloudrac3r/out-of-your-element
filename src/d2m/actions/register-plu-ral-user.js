// @ts-check

const assert = require("assert").strict
const {reg} = require("../../matrix/read-registration")
const Ty = require("../../types")

const passthrough = require("../../passthrough")
const {sync, db, select, from} = passthrough
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")
/** @type {import("./register-user")} */
const registerUser = sync.require("./register-user")

/** @returns {Promise<Ty.PluRalWebhookMessage>} */
async function fetchMessage(channelID, messageID) {
	assert(reg.ooye.plu_ral_api_key)
	try {
		var res = await fetch(`https://api.plural.gg/messages/${channelID}/${messageID}?member=true`, {
			headers: {
				Authorization: reg.ooye.plu_ral_api_key
			}
		})
	} catch (networkError) {
		// Network issue, raise a more readable message
		throw new Error(`Failed to connect to /plu/ral API: ${networkError.toString()}`)
	}
	if (!res.ok) throw new Error(`/plu/ral API returned an error: ${await res.text()}`)
	/** @type {any} */
	const root = await res.json()
	if (!root.member) throw new Error(`/plu/ral API didn't return member data: ${JSON.stringify(root)}`)
	return root
}

/**
 * Using the same sim names and fake user IDs for /plu/ral members, since unlike PluralKit they don't have a short and a long ID.
 * @param {Ty.PluRalWebhookMessage} pluRalMessage
 */
function getSimName(pluRalMessage) {
	return `_pl_${pluRalMessage.member_id}`
}

/**
 * A sim is an account that is being simulated by the bridge to copy events from the other side.
 * @param {Ty.PluRalWebhookMessage} pluRalMessage
 * @returns mxid
 */
async function createSim(pluRalMessage) {
	// Choose sim name
	const simName = getSimName(pluRalMessage)
	const localpart = reg.ooye.namespace_prefix + simName
	const mxid = `@${localpart}:${reg.ooye.server_name}`

	// Save chosen name in the database forever
	db.prepare("INSERT INTO sim (user_id, username, sim_name, mxid) VALUES (?, ?, ?, ?)").run(simName, simName, simName, mxid)

	// Register matrix user with that name
	try {
		await api.register(localpart)
	} catch (e) {
		// If user creation fails, manually undo the database change. Still isn't perfect, but should help.
		// (I would prefer a transaction, but it's not safe to leave transactions open across event loop ticks.)
		db.prepare("DELETE FROM sim WHERE user_id = ?").run(simName)
		throw e
	}
	return mxid
}

/**
 * Ensure a sim is registered for the user.
 * If there is already a sim, use that one. If there isn't one yet, register a new sim.
 * @param {Ty.PluRalWebhookMessage} pluRalMessage
 * @returns {Promise<string>} mxid
 */
async function ensureSim(pluRalMessage) {
	let mxid = null
	const existing = select("sim", "mxid", {user_id: getSimName(pluRalMessage)}).pluck().get()
	if (existing) {
		mxid = existing
	} else {
		mxid = await createSim(pluRalMessage)
	}
	return mxid
}

/**
 * Ensure a sim is registered for the user and is joined to the room.
 * @param {Ty.PluRalWebhookMessage} pluRalMessage
 * @param {string} roomID
 * @returns {Promise<string>} mxid
 */
async function ensureSimJoined(pluRalMessage, roomID) {
	// Ensure room ID is really an ID, not an alias
	assert.ok(roomID[0] === "!")

	// Ensure user
	const mxid = await ensureSim(pluRalMessage)

	// Ensure joined
	const existing = select("sim_member", "mxid", {room_id: roomID, mxid}).pluck().get()
	if (!existing) {
		await api.inviteToRoom(roomID, mxid)
		await api.joinRoom(roomID, mxid)
		db.prepare("INSERT OR IGNORE INTO sim_member (room_id, mxid) VALUES (?, ?)").run(roomID, mxid)
	}
	return mxid
}

/**
 * Generate profile data based on webhook displayname and configured avatar.
 * @param {Ty.PluRalWebhookMessage} pluRalMessage
 * @param {Ty.WebhookAuthor} author
 */
async function memberToStateContent(pluRalMessage, author) {
	// We prefer to use the member's avatar URL data since the image upload can be cached across channels,
	// unlike the userAvatar URL which is unique per channel, due to the webhook ID being in the URL.
	const avatar = pluRalMessage.member.avatar_url || file.userAvatar(author)

	const content = {
		displayname: author.username,
		membership: "join",
		"moe.cadence.ooye.plu_ral_member": pluRalMessage.member
	}
	if (avatar) content.avatar_url = await file.uploadDiscordFileToMxc(avatar)

	return content
}

/**
 * Sync profile data for a sim user. This function follows the following process:
 * 1. Look up data about proxy user from API
 * 2. If this fails, try to use previously cached data (won't sync)
 * 3. Create and join the sim to the room if needed
 * 4. Make an object of what the new room member state content would be, including uploading the profile picture if it hasn't been done before
 * 5. Compare against the previously known state content, which is helpfully stored in the database
 * 6. If the state content has changed, send it to Matrix and update it in the database for next time
 * @param {string} channelID to call API with
 * @param {string} messageID to call API with
 * @param {Ty.WebhookAuthor} author for profile data
 * @param {string} roomID room to join member to
 * @param {boolean} shouldActuallySync whether to actually sync updated user data or just ensure it's joined
 * @returns {Promise<string>} mxid of the updated sim
 */
async function syncUser(channelID, messageID, author, roomID, shouldActuallySync) {
	try {
		// API lookup
		var pluRalMessage = await fetchMessage(channelID, messageID)
		const simName = getSimName(pluRalMessage)
		db.prepare("REPLACE INTO sim_proxy (user_id, proxy_owner_id, displayname, proxy_app) VALUES (?, ?, ?, 1)").run(simName, pluRalMessage.author_id, author.username)
	} catch (e) {
		// Fall back to offline cache
		const senderMxid = from("sim_proxy").join("sim", "user_id").join("sim_member", "mxid").where({displayname: author.username, room_id: roomID, proxy_app: 1}).pluck("mxid").get()
		if (!senderMxid) throw e
		return senderMxid
	}

	// Create and join the sim to the room if needed
	const mxid = await ensureSimJoined(pluRalMessage, roomID)

	if (shouldActuallySync) {
		// Build current profile data and sync if the hash has changed
		const content = await memberToStateContent(pluRalMessage, author)
		await registerUser._sendSyncUser(roomID, mxid, content, null)
	}

	return mxid
}

module.exports.syncUser = syncUser
