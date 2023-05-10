// @ts-check

const assert = require("assert").strict
const DiscordTypes = require("discord-api-types/v10")

const passthrough = require("../../passthrough")
const { discord, sync, db } = passthrough
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("../../matrix/kstate")} */
const ks = sync.require("../../matrix/kstate")

/**
 * @param {string} roomID
 */
async function roomToKState(roomID) {
	const root = await api.getAllState(roomID)
	return ks.stateToKState(root)
}

/**
 * @params {string} roomID
 * @params {any} kstate
 */
function applyKStateDiffToRoom(roomID, kstate) {
	const events = ks.kstateToState(kstate)
	return Promise.all(events.map(({type, state_key, content}) =>
		api.sendState(roomID, type, state_key, content)
	))
}

/**
 * @param {import("discord-api-types/v10").APIGuildTextChannel} channel
 * @param {import("discord-api-types/v10").APIGuild} guild
 */
async function channelToKState(channel, guild) {
	const spaceID = db.prepare("SELECT space_id FROM guild_space WHERE guild_id = ?").pluck().get(guild.id)
	assert.ok(typeof spaceID === "string")

	const avatarEventContent = {}
	if (guild.icon) {
		avatarEventContent.discord_path = file.guildIcon(guild)
		avatarEventContent.url = await file.uploadDiscordFileToMxc(avatarEventContent.discord_path) // TODO: somehow represent future values in kstate (callbacks?), while still allowing for diffing, so test cases don't need to touch the media API
	}

	const channelKState = {
		"m.room.name/": {name: channel.name},
		"m.room.topic/": {$if: channel.topic, topic: channel.topic},
		"m.room.avatar/": avatarEventContent,
		"m.room.guest_access/": {guest_access: "can_join"},
		"m.room.history_visibility/": {history_visibility: "invited"},
		[`m.space.parent/${spaceID}`]: {
			via: ["cadence.moe"], // TODO: put the proper server here
			canonical: true
		},
		"m.room.join_rules/": {
			join_rule: "restricted",
			allow: [{
				type: "m.room.membership",
				room_id: spaceID
			}]
		}
	}

	return {spaceID, channelKState}
}

/**
 * Create a bridge room, store the relationship in the database, and add it to the guild's space.
 * @param {import("discord-api-types/v10").APIGuildTextChannel} channel
 * @param guild
 * @param {string} spaceID
 * @param {any} kstate
 * @returns {Promise<string>} room ID
 */
async function createRoom(channel, guild, spaceID, kstate) {
	const roomID = await api.createRoom({
		name: channel.name,
		topic: channel.topic || undefined,
		preset: "private_chat",
		visibility: "private",
		invite: ["@cadence:cadence.moe"], // TODO
		initial_state: ks.kstateToState(kstate)
	})

	db.prepare("INSERT INTO channel_room (channel_id, room_id) VALUES (?, ?)").run(channel.id, roomID)

	// Put the newly created child into the space
	await api.sendState(spaceID, "m.space.child", roomID, { // TODO: should I deduplicate with the equivalent code from syncRoom?
		via: ["cadence.moe"] // TODO: use the proper server
	})

	return roomID
}

/**
 * @param {import("discord-api-types/v10").APIGuildChannel} channel
 */
function channelToGuild(channel) {
	const guildID = channel.guild_id
	assert(guildID)
	const guild = discord.guilds.get(guildID)
	assert(guild)
	return guild
}

/*
	Ensure flow:
	1. Get IDs
	2. Does room exist? If so great!
	(it doesn't, so it needs to be created)
	3. Get kstate for channel
	4. Create room, return new ID

	New combined flow with ensure / sync:
	1. Get IDs
	2. Does room exist?
	2.5: If room does exist AND don't need to sync: return here
	3. Get kstate for channel
	4. Create room with kstate if room doesn't exist
	5. Get and update room state with kstate if room does exist
*/

/**
 * @param {string} channelID
 * @param {boolean} shouldActuallySync false if just need to ensure room exists (which is a quick database check), true if also want to sync room data when it does exist (slow)
 * @returns {Promise<string>} room ID
 */
async function _syncRoom(channelID, shouldActuallySync) {
	/** @ts-ignore @type {import("discord-api-types/v10").APIGuildChannel} */
	const channel = discord.channels.get(channelID)
	assert.ok(channel)
	const guild = channelToGuild(channel)

	/** @type {string?} */
	const existing = db.prepare("SELECT room_id from channel_room WHERE channel_id = ?").pluck().get(channel.id)
	if (!existing) {
		const {spaceID, channelKState} = await channelToKState(channel, guild)
		return createRoom(channel, guild, spaceID, channelKState)
	} else {
		if (!shouldActuallySync) {
			return existing // only need to ensure room exists, and it does. return the room ID
		}

		const {spaceID, channelKState} = await channelToKState(channel, guild)

		// sync channel state to room
		const roomKState = await roomToKState(existing)
		const roomDiff = ks.diffKState(roomKState, channelKState)
		const roomApply = applyKStateDiffToRoom(existing, roomDiff)

		// sync room as space member
		const spaceKState = await roomToKState(spaceID)
		const spaceDiff = ks.diffKState(spaceKState, {
			[`m.space.child/${existing}`]: {
				via: ["cadence.moe"] // TODO: use the proper server
			}
		})
		const spaceApply = applyKStateDiffToRoom(spaceID, spaceDiff)
		await Promise.all([roomApply, spaceApply])

		return existing
	}
}

function ensureRoom(channelID) {
	return _syncRoom(channelID, false)
}

function syncRoom(channelID) {
	return _syncRoom(channelID, true)
}

async function createAllForGuild(guildID) {
	const channelIDs = discord.guildChannelMap.get(guildID)
	assert.ok(channelIDs)
	for (const channelID of channelIDs) {
		await syncRoom(channelID).then(r => console.log(`synced ${channelID}:`, r))
	}
}

module.exports.createRoom = createRoom
module.exports.ensureRoom = ensureRoom
module.exports.syncRoom = syncRoom
module.exports.createAllForGuild = createAllForGuild
module.exports.channelToKState = channelToKState
