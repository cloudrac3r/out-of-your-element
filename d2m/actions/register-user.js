// @ts-check

const assert = require("assert")
const reg = require("../../matrix/read-registration")

const passthrough = require("../../passthrough")
const {discord, sync, db, select} = passthrough
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")
/** @type {import("../converters/user-to-mxid")} */
const userToMxid = sync.require("../converters/user-to-mxid")
/** @type {import("xxhash-wasm").XXHashAPI} */ // @ts-ignore
let hasher = null
// @ts-ignore
require("xxhash-wasm")().then(h => hasher = h)

/**
 * A sim is an account that is being simulated by the bridge to copy events from the other side.
 * @param {import("discord-api-types/v10").APIUser} user
 * @returns mxid
 */
async function createSim(user) {
	// Choose sim name
	const simName = userToMxid.userToSimName(user)
	const localpart = reg.ooye.namespace_prefix + simName
	const mxid = `@${localpart}:${reg.ooye.server_name}`

	// Save chosen name in the database forever
	// Making this database change right away so that in a concurrent registration, the 2nd registration will already have generated a different localpart because it can see this row when it generates
	db.prepare("INSERT INTO sim (user_id, sim_name, localpart, mxid) VALUES (?, ?, ?, ?)").run(user.id, simName, localpart, mxid)

	// Register matrix user with that name
	try {
		await api.register(localpart)
	} catch (e) {
		// If user creation fails, manually undo the database change. Still isn't perfect, but should help.
		// (I would prefer a transaction, but it's not safe to leave transactions open across event loop ticks.)
		db.prepare("DELETE FROM sim WHERE user_id = ?").run(user.id)
		throw e
	}
	return mxid
}

/**
 * Ensure a sim is registered for the user.
 * If there is already a sim, use that one. If there isn't one yet, register a new sim.
 * @param {import("discord-api-types/v10").APIUser} user
 * @returns {Promise<string>} mxid
 */
async function ensureSim(user) {
	let mxid = null
	const existing = select("sim", "mxid", {user_id: user.id}).pluck().get()
	if (existing) {
		mxid = existing
	} else {
		mxid = await createSim(user)
	}
	return mxid
}

/**
 * Ensure a sim is registered for the user and is joined to the room.
 * @param {import("discord-api-types/v10").APIUser} user
 * @param {string} roomID
 * @returns {Promise<string>} mxid
 */
async function ensureSimJoined(user, roomID) {
	// Ensure room ID is really an ID, not an alias
	assert.ok(roomID[0] === "!")

	// Ensure user
	const mxid = await ensureSim(user)

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
 * @param {import("discord-api-types/v10").APIUser} user
 * @param {Omit<import("discord-api-types/v10").APIGuildMember, "user">} member
 */
async function memberToStateContent(user, member, guildID) {
	let displayname = user.username
	if (user.global_name) displayname = user.global_name
	if (member.nick) displayname = member.nick

	const content = {
		displayname,
		membership: "join",
		"moe.cadence.ooye.member": {
		},
		"uk.half-shot.discord.member": {
			bot: !!user.bot,
			displayColor: user.accent_color,
			id: user.id,
			username: user.discriminator.length === 4 ? `${user.username}#${user.discriminator}` : `@${user.username}`
		}
	}

	if (member.avatar || user.avatar) {
		// const avatarPath = file.userAvatar(user) // the user avatar only
		const avatarPath = file.memberAvatar(guildID, user, member) // the member avatar or the user avatar
		content["moe.cadence.ooye.member"].avatar = avatarPath
		content.avatar_url = await file.uploadDiscordFileToMxc(avatarPath)
	}

	return content
}

function hashProfileContent(content) {
	const unsignedHash = hasher.h64(`${content.displayname}\u0000${content.avatar_url}`)
	const signedHash = unsignedHash - 0x8000000000000000n // shifting down to signed 64-bit range
	return signedHash
}

/**
 * Sync profile data for a sim user. This function follows the following process:
 * 1. Join the sim to the room if needed
 * 2. Make an object of what the new room member state content would be, including uploading the profile picture if it hasn't been done before
 * 3. Compare against the previously known state content, which is helpfully stored in the database
 * 4. If the state content has changed, send it to Matrix and update it in the database for next time
 * @param {import("discord-api-types/v10").APIUser} user
 * @param {Omit<import("discord-api-types/v10").APIGuildMember, "user">} member
 * @returns {Promise<string>} mxid of the updated sim
 */
async function syncUser(user, member, guildID, roomID) {
	const mxid = await ensureSimJoined(user, roomID)
	const content = await memberToStateContent(user, member, guildID)
	const currentHash = hashProfileContent(content)
	const existingHash = select("sim_member", "hashed_profile_content", {room_id: roomID, mxid}).safeIntegers().pluck().get()
	// only do the actual sync if the hash has changed since we last looked
	if (existingHash !== currentHash) {
		await api.sendState(roomID, "m.room.member", mxid, content, mxid)
		db.prepare("UPDATE sim_member SET hashed_profile_content = ? WHERE room_id = ? AND mxid = ?").run(currentHash, roomID, mxid)
	}
	return mxid
}

async function syncAllUsersInRoom(roomID) {
	const mxids = select("sim_member", "mxid", {room_id: roomID}).pluck().all()

	const channelID = select("channel_room", "channel_id", {room_id: roomID}).pluck().get()
	assert.ok(typeof channelID === "string")

	/** @ts-ignore @type {import("discord-api-types/v10").APIGuildChannel} */
	const channel = discord.channels.get(channelID)
	const guildID = channel.guild_id
	assert.ok(typeof guildID === "string")

	for (const mxid of mxids) {
		const userID = select("sim", "user_id", {mxid}).pluck().get()
		assert.ok(typeof userID === "string")

		/** @ts-ignore @type {Required<import("discord-api-types/v10").APIGuildMember>} */
		const member = await discord.snow.guild.getGuildMember(guildID, userID)
		/** @ts-ignore @type {Required<import("discord-api-types/v10").APIUser>} user */
		const user = member.user
		assert.ok(user)

		console.log(`[user sync] to matrix: ${user.username} in ${channel.name}`)
		await syncUser(user, member, guildID, roomID)
	}
}

module.exports._memberToStateContent = memberToStateContent
module.exports.ensureSim = ensureSim
module.exports.ensureSimJoined = ensureSimJoined
module.exports.syncUser = syncUser
module.exports.syncAllUsersInRoom = syncAllUsersInRoom
