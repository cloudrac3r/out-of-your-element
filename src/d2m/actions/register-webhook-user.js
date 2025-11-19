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
/** @type {import("../converters/user-to-mxid")} */
const userToMxid = sync.require("../converters/user-to-mxid")

/**
 * A sim is an account that is being simulated by the bridge to copy events from the other side.
 * @param {string} fakeUserID
 * @param {Ty.WebhookAuthor} author
 * @returns mxid
 */
async function createSim(fakeUserID, author) {
	// Choose sim name
	const simName = userToMxid.webhookAuthorToSimName(author)
	const localpart = reg.ooye.namespace_prefix + simName
	const mxid = `@${localpart}:${reg.ooye.server_name}`

	// Save chosen name in the database forever
	db.prepare("INSERT INTO sim (user_id, username, sim_name, mxid) VALUES (?, ?, ?, ?)").run(fakeUserID, author.username, simName, mxid)

	// Register matrix user with that name
	try {
		await api.register(localpart)
	} catch (e) {
		// If user creation fails, manually undo the database change. Still isn't perfect, but should help.
		// (I would prefer a transaction, but it's not safe to leave transactions open across event loop ticks.)
		db.prepare("DELETE FROM sim WHERE user_id = ?").run(fakeUserID)
		throw e
	}
	return mxid
}

/**
 * Ensure a sim is registered for the user.
 * If there is already a sim, use that one. If there isn't one yet, register a new sim.
 * @param {string} fakeUserID
 * @param {Ty.WebhookAuthor} author
 * @returns {Promise<string>} mxid
 */
async function ensureSim(fakeUserID, author) {
	let mxid = null
	const existing = select("sim", "mxid", {user_id: fakeUserID}).pluck().get()
	if (existing) {
		mxid = existing
	} else {
		mxid = await createSim(fakeUserID, author)
	}
	return mxid
}

/**
 * Ensure a sim is registered for the user and is joined to the room.
 * @param {string} fakeUserID
 * @param {Ty.WebhookAuthor} author
 * @param {string} roomID
 * @returns {Promise<string>} mxid
 */
async function ensureSimJoined(fakeUserID, author, roomID) {
	// Ensure room ID is really an ID, not an alias
	assert.ok(roomID[0] === "!")

	// Ensure user
	const mxid = await ensureSim(fakeUserID, author)

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
 * @param {Ty.WebhookAuthor} author
 */
async function authorToStateContent(author) {
	// We prefer to use the member's avatar URL data since the image upload can be cached across channels,
	// unlike the userAvatar URL which is unique per channel, due to the webhook ID being in the URL.
	const avatar = file.userAvatar(author)

	const content = {
		displayname: author.username,
		membership: "join",
	}
	if (avatar) content.avatar_url = await file.uploadDiscordFileToMxc(avatar)

	return content
}

/**
 * Sync profile data for a sim webhook user. This function follows the following process:
 * 1. Create and join the sim to the room if needed
 * 2. Make an object of what the new room member state content would be, including uploading the profile picture if it hasn't been done before
 * 3. Compare against the previously known state content, which is helpfully stored in the database
 * 4. If the state content has changed, send it to Matrix and update it in the database for next time
 * @param {Ty.WebhookAuthor} author for profile data
 * @param {string} roomID room to join member to
 * @param {boolean} shouldActuallySync whether to actually sync updated user data or just ensure it's joined
 * @returns {Promise<string>} mxid of the updated sim
 */
async function syncUser(author, roomID, shouldActuallySync) {
	const fakeUserID = userToMxid.webhookAuthorToFakeUserID(author)

	// Create and join the sim to the room if needed
	const mxid = await ensureSimJoined(fakeUserID, author, roomID)

	if (shouldActuallySync) {
		// Build current profile data
		const content = await authorToStateContent(author)
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
