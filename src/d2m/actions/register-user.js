// @ts-check

const assert = require("assert").strict
const {reg} = require("../../matrix/read-registration")
const DiscordTypes = require("discord-api-types/v10")
const Ty = require("../../types")
const mixin = require("@cloudrac3r/mixin-deep")

const passthrough = require("../../passthrough")
const {discord, sync, db, select} = passthrough
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")
/** @type {import("../../discord/utils")} */
const utils = sync.require("../../discord/utils")
/** @type {import("../converters/user-to-mxid")} */
const userToMxid = sync.require("../converters/user-to-mxid")
/** @type {import("./create-room")} */
const createRoom = sync.require("./create-room")
/** @type {import("xxhash-wasm").XXHashAPI} */ // @ts-ignore
let hasher = null
// @ts-ignore
require("xxhash-wasm")().then(h => hasher = h)

/**
 * A sim is an account that is being simulated by the bridge to copy events from the other side.
 * @param {DiscordTypes.APIUser} user
 * @returns mxid
 */
async function createSim(user) {
	// Choose sim name
	const simName = userToMxid.userToSimName(user)
	const localpart = reg.ooye.namespace_prefix + simName
	const mxid = `@${localpart}:${reg.ooye.server_name}`

	// Save chosen name in the database forever
	// Making this database change right away so that in a concurrent registration, the 2nd registration will already have generated a different localpart because it can see this row when it generates
	db.prepare("INSERT INTO sim (user_id, username, sim_name, mxid) VALUES (?, ?, ?, ?)").run(user.id, user.username, simName, mxid)

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
 * @param {DiscordTypes.APIUser} user
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
 * @param {DiscordTypes.APIUser} user
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
 * @param {DiscordTypes.APIUser} user
 * @param {Omit<DiscordTypes.APIGuildMember, "user"> | undefined} member
 */
async function memberToStateContent(user, member, guildID) {
	let displayname = user.username
	if (user.global_name) displayname = user.global_name
	if (member?.nick) displayname = member.nick

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

	if (member?.avatar || user.avatar) {
		// const avatarPath = file.userAvatar(user) // the user avatar only
		const avatarPath = file.memberAvatar(guildID, user, member) // the member avatar or the user avatar
		content["moe.cadence.ooye.member"].avatar = avatarPath
		content.avatar_url = await file.uploadDiscordFileToMxc(avatarPath)
	}

	return content
}

/**
 * https://gitdab.com/cadence/out-of-your-element/issues/9
 * @param {DiscordTypes.APIUser} user
 * @param {Omit<DiscordTypes.APIGuildMember, "user"> | undefined} member
 * @param {DiscordTypes.APIGuild} guild
 * @param {DiscordTypes.APIGuildChannel} channel
 * @returns {number} 0 to 100
 */
function memberToPowerLevel(user, member, guild, channel) {
	if (!member) return 0

	const permissions = utils.getPermissions(member.roles, guild.roles, user.id, channel.permission_overwrites)
	const everyonePermissions = utils.getPermissions([], guild.roles, undefined, channel.permission_overwrites)
	/*
	 * PL 100 = Administrator = People who can brick the room. RATIONALE:
	 * 	- Administrator.
	 * 	- Manage Webhooks: People who remove the webhook can break the room.
	 * 	- Manage Guild: People who can manage guild can add bots.
	 * 	- Manage Channels: People who can manage the channel can delete it.
	 * (Setting sim users to PL 100 is safe because even though we can't demote the sims we can use code to make the sims demote themselves.)
	 */
	if (guild.owner_id === user.id || utils.hasSomePermissions(permissions, ["Administrator", "ManageWebhooks", "ManageGuild", "ManageChannels"])) return 100
	/*
	 * PL 50 = Moderator = People who can manage people and messages in many ways. RATIONALE:
	 * 	- Manage Messages: Can moderate by pinning or deleting the conversation.
	 * 	- Manage Nicknames: Can moderate by removing inappropriate nicknames.
	 * 	- Manage Threads: Can moderate by deleting conversations.
	 * 	- Kick Members & Ban Members: Can moderate by removing disruptive people.
	 * 	- Mute Members & Deafen Members: Can moderate by silencing disruptive people in ways they can't undo.
	 * 	- Moderate Members.
	 */
	if (utils.hasSomePermissions(permissions, ["ManageMessages", "ManageNicknames", "ManageThreads", "KickMembers", "BanMembers", "MuteMembers", "DeafenMembers", "ModerateMembers"])) return 50
	/* PL 50 = if room is read-only but the user has been specially allowed to send messages */
	const everyoneCanSend = utils.hasPermission(everyonePermissions, DiscordTypes.PermissionFlagsBits.SendMessages)
	const userCanSend = utils.hasPermission(permissions, DiscordTypes.PermissionFlagsBits.SendMessages)
	if (!everyoneCanSend && userCanSend) return createRoom.READ_ONLY_ROOM_EVENTS_DEFAULT_POWER
	/* PL 20 = Mention Everyone for technical reasons. */
	const everyoneCanMentionEveryone = utils.hasPermission(everyonePermissions, DiscordTypes.PermissionFlagsBits.MentionEveryone)
	const userCanMentionEveryone = utils.hasPermission(permissions, DiscordTypes.PermissionFlagsBits.MentionEveryone)
	if (!everyoneCanMentionEveryone && userCanMentionEveryone) return 20
	return 0
}

/**
 * @param {any} content
 * @param {number} powerLevel
 */
function _hashProfileContent(content, powerLevel) {
	const unsignedHash = hasher.h64(`${content.displayname}\u0000${content.avatar_url}\u0000${powerLevel}`)
	const signedHash = unsignedHash - 0x8000000000000000n // shifting down to signed 64-bit range
	return signedHash
}

/**
 * Sync profile data for a sim user. This function follows the following process:
 * 1. Join the sim to the room if needed
 * 2. Make an object of what the new room member state content would be, including uploading the profile picture if it hasn't been done before
 * 3. Calculate the power level the user should get based on their Discord permissions
 * 4. Compare against the previously known state content, which is helpfully stored in the database
 * 5. If the state content or power level have changed, send them to Matrix and update them in the database for next time
 * @param {DiscordTypes.APIUser} user
 * @param {Omit<DiscordTypes.APIGuildMember, "user"> | undefined} member
 * @param {DiscordTypes.APIGuildChannel} channel
 * @param {DiscordTypes.APIGuild} guild
 * @param {string} roomID
 * @returns {Promise<string>} mxid of the updated sim
 */
async function syncUser(user, member, channel, guild, roomID) {
	const mxid = await ensureSimJoined(user, roomID)
	const content = await memberToStateContent(user, member, guild.id)
	const powerLevel = memberToPowerLevel(user, member, guild, channel)
	const currentHash = _hashProfileContent(content, powerLevel)
	const existingHash = select("sim_member", "hashed_profile_content", {room_id: roomID, mxid}).safeIntegers().pluck().get()
	// only do the actual sync if the hash has changed since we last looked
	const hashHasChanged = existingHash !== currentHash
	// however, do not overwrite pre-existing data if we already have data and `member` is not accessible, because this would replace good data with bad data
	const wouldOverwritePreExisting = existingHash && !member
	if (hashHasChanged && !wouldOverwritePreExisting) {
		// Update room member state
		await api.sendState(roomID, "m.room.member", mxid, content, mxid)
		// Update power levels
		await api.setUserPower(roomID, mxid, powerLevel)
		// Update cached hash
		db.prepare("UPDATE sim_member SET hashed_profile_content = ? WHERE room_id = ? AND mxid = ?").run(currentHash, roomID, mxid)
	}
	return mxid
}

/**
 * @param {string} roomID
 */
async function syncAllUsersInRoom(roomID) {
	const mxids = select("sim_member", "mxid", {room_id: roomID}).pluck().all()

	const channelID = select("channel_room", "channel_id", {room_id: roomID}).pluck().get()
	assert.ok(typeof channelID === "string")

	/** @ts-ignore @type {DiscordTypes.APIGuildChannel} */
	const channel = discord.channels.get(channelID)
	const guildID = channel.guild_id
	assert.ok(typeof guildID === "string")
	/** @ts-ignore @type {DiscordTypes.APIGuild} */
	const guild = discord.guilds.get(guildID)

	for (const mxid of mxids) {
		const userID = select("sim", "user_id", {mxid}).pluck().get()
		assert.ok(typeof userID === "string")

		/** @ts-ignore @type {Required<DiscordTypes.APIGuildMember>} */
		const member = await discord.snow.guild.getGuildMember(guildID, userID)
		/** @ts-ignore @type {Required<DiscordTypes.APIUser>} user */
		const user = member.user
		assert.ok(user)

		console.log(`[user sync] to matrix: ${user.username} in ${channel.name}`)
		await syncUser(user, member, channel, guild, roomID)
	}
}

module.exports._memberToStateContent = memberToStateContent
module.exports._hashProfileContent = _hashProfileContent
module.exports.ensureSim = ensureSim
module.exports.ensureSimJoined = ensureSimJoined
module.exports.syncUser = syncUser
module.exports.syncAllUsersInRoom = syncAllUsersInRoom
module.exports._memberToPowerLevel = memberToPowerLevel
