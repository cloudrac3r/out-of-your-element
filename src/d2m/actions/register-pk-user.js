// @ts-check

const assert = require("assert")
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

/**
 * @typedef WebhookAuthor Discord API message->author. A webhook as an author.
 * @prop {string} username
 * @prop {string?} avatar
 * @prop {string} id
 */

/** @returns {Promise<Ty.PkMessage>} */
async function fetchMessage(messageID) {
	try {
		var res = await fetch(`https://api.pluralkit.me/v2/messages/${messageID}`)
	} catch (networkError) {
		// Network issue, raise a more readable message
		throw new Error(`Failed to connect to PK API: ${networkError.toString()}`)
	}
	if (!res.ok) throw new Error(`PK API returned an error: ${await res.text()}`)
	const root = await res.json()
	if (!root.member) throw new Error(`PK API didn't return member data: ${JSON.stringify(root)}`)
	return root
}

/**
 * A sim is an account that is being simulated by the bridge to copy events from the other side.
 * @param {Ty.PkMessage} pkMessage
 * @returns mxid
 */
async function createSim(pkMessage) {
	// Choose sim name
	const simName = "_pk_" + pkMessage.member.id
	const localpart = reg.ooye.namespace_prefix + simName
	const mxid = `@${localpart}:${reg.ooye.server_name}`

	// Save chosen name in the database forever
	db.prepare("INSERT INTO sim (user_id, username, sim_name, mxid) VALUES (?, ?, ?, ?)").run(pkMessage.member.uuid, simName, simName, mxid)

	// Register matrix user with that name
	try {
		await api.register(localpart)
	} catch (e) {
		// If user creation fails, manually undo the database change. Still isn't perfect, but should help.
		// (I would prefer a transaction, but it's not safe to leave transactions open across event loop ticks.)
		db.prepare("DELETE FROM sim WHERE user_id = ?").run(pkMessage.member.uuid)
		throw e
	}
	return mxid
}

/**
 * Ensure a sim is registered for the user.
 * If there is already a sim, use that one. If there isn't one yet, register a new sim.
 * @param {Ty.PkMessage} pkMessage
 * @returns {Promise<string>} mxid
 */
async function ensureSim(pkMessage) {
	let mxid = null
	const existing = select("sim", "mxid", {user_id: pkMessage.member.uuid}).pluck().get()
	if (existing) {
		mxid = existing
	} else {
		mxid = await createSim(pkMessage)
	}
	return mxid
}

/**
 * Ensure a sim is registered for the user and is joined to the room.
 * @param {Ty.PkMessage} pkMessage
 * @param {string} roomID
 * @returns {Promise<string>} mxid
 */
async function ensureSimJoined(pkMessage, roomID) {
	// Ensure room ID is really an ID, not an alias
	assert.ok(roomID[0] === "!")

	// Ensure user
	const mxid = await ensureSim(pkMessage)

	// Ensure joined
	const existing = select("sim_member", "mxid", {room_id: roomID, mxid}).pluck().get()
	if (!existing) {
		try {
			await api.inviteToRoom(roomID, mxid)
			await api.joinRoom(roomID, mxid)
		} catch (e) {
			if (e.message.includes("is already in the room.")) {
				// Sweet!
			} else {
				throw e
			}
		}
		db.prepare("INSERT OR IGNORE INTO sim_member (room_id, mxid) VALUES (?, ?)").run(roomID, mxid)
	}
	return mxid
}

/**
 * Generate profile data based on webhook displayname and configured avatar.
 * @param {Ty.PkMessage} pkMessage
 * @param {WebhookAuthor} author
 */
async function memberToStateContent(pkMessage, author) {
	// We prefer to use the member's avatar URL data since the image upload can be cached across channels,
	// unlike the userAvatar URL which is unique per channel, due to the webhook ID being in the URL.
	const avatar = pkMessage.member.avatar_url || pkMessage.member.webhook_avatar_url || pkMessage.system.avatar_url || file.userAvatar(author)

	const content = {
		displayname: author.username,
		membership: "join",
		"moe.cadence.ooye.pk_member": pkMessage.member
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
 * @param {string} messageID to call API with
 * @param {WebhookAuthor} author for profile data
 * @param {string} roomID room to join member to
 * @param {boolean} shouldActuallySync whether to actually sync updated user data or just ensure it's joined
 * @returns {Promise<string>} mxid of the updated sim
 */
async function syncUser(messageID, author, roomID, shouldActuallySync) {
	try {
		// API lookup
		var pkMessage = await fetchMessage(messageID)
		db.prepare("INSERT OR IGNORE INTO sim_proxy (user_id, proxy_owner_id, displayname) VALUES (?, ?, ?)").run(pkMessage.member.uuid, pkMessage.sender, author.username)
	} catch (e) {
		// Fall back to offline cache
		const senderMxid = from("sim_proxy").join("sim", "user_id").join("sim_member", "mxid").where({displayname: author.username, room_id: roomID}).pluck("mxid").get()
		if (!senderMxid) throw e
		return senderMxid
	}

	// Create and join the sim to the room if needed
	const mxid = await ensureSimJoined(pkMessage, roomID)

	if (shouldActuallySync) {
		// Build current profile data
		const content = await memberToStateContent(pkMessage, author)
		const currentHash = registerUser._hashProfileContent(content, 0)
		const existingHash = select("sim_member", "hashed_profile_content", {room_id: roomID, mxid}).safeIntegers().pluck().get()

		// Only do the actual sync if the hash has changed since we last looked
		if (existingHash !== currentHash) {
			await api.sendState(roomID, "m.room.member", mxid, content, mxid)
			db.prepare("UPDATE sim_member SET hashed_profile_content = ? WHERE room_id = ? AND mxid = ?").run(currentHash, roomID, mxid)
		}
	}

	return mxid
}

module.exports.syncUser = syncUser
