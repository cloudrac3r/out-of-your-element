// @ts-check

const assert = require("assert").strict
const DiscordTypes = require("discord-api-types/v10")
const reg = require("../../matrix/read-registration")

const passthrough = require("../../passthrough")
const { discord, sync, db } = passthrough
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("../../matrix/kstate")} */
const ks = sync.require("../../matrix/kstate")

/** @type {Map<string, Promise<string>>} channel ID -> Promise<room ID> */
const inflightRoomCreate = new Map()

/**
 * @param {string} roomID
 */
async function roomToKState(roomID) {
	const root = await api.getAllState(roomID)
	return ks.stateToKState(root)
}

/**
 * @param {string} roomID
 * @param {any} kstate
 */
function applyKStateDiffToRoom(roomID, kstate) {
	const events = ks.kstateToState(kstate)
	return Promise.all(events.map(({type, state_key, content}) =>
		api.sendState(roomID, type, state_key, content)
	))
}

/**
 * @param {{id: string, name: string, topic?: string?}} channel
 * @param {{id: string}} guild
 * @param {string?} customName
 */
function convertNameAndTopic(channel, guild, customName) {
	const convertedName = customName || channel.name;
	const maybeTopicWithPipe = channel.topic ? ` | ${channel.topic}` : '';
	const maybeTopicWithNewlines = channel.topic ? `${channel.topic}\n\n` : '';
	const channelIDPart = `Channel ID: ${channel.id}`;
	const guildIDPart = `Guild ID: ${guild.id}`;

	const convertedTopic = customName
		 ? `#${channel.name}${maybeTopicWithPipe}\n\n${channelIDPart}\n${guildIDPart}`
		 : `${maybeTopicWithNewlines}${channelIDPart}\n${guildIDPart}`;

	return [convertedName, convertedTopic];
}

/**
 * @param {DiscordTypes.APIGuildTextChannel | DiscordTypes.APIThreadChannel} channel
 * @param {DiscordTypes.APIGuild} guild
 */
async function channelToKState(channel, guild) {
	const spaceID = db.prepare("SELECT space_id FROM guild_space WHERE guild_id = ?").pluck().get(guild.id)
	assert.ok(typeof spaceID === "string")

	const row = db.prepare("SELECT nick, custom_avatar FROM channel_room WHERE channel_id = ?").get(channel.id)
	const customName = row?.nick
	const customAvatar = row?.custom_avatar
	const [convertedName, convertedTopic] = convertNameAndTopic(channel, guild, customName)

	const avatarEventContent = {}
	if (customAvatar) {
		avatarEventContent.url = customAvatar
	} else if (guild.icon) {
		avatarEventContent.discord_path = file.guildIcon(guild)
		avatarEventContent.url = await file.uploadDiscordFileToMxc(avatarEventContent.discord_path) // TODO: somehow represent future values in kstate (callbacks?), while still allowing for diffing, so test cases don't need to touch the media API
	}

	let history_visibility = "invited"
	if (channel["thread_metadata"]) history_visibility = "world_readable"

	const channelKState = {
		"m.room.name/": {name: convertedName},
		"m.room.topic/": {topic: convertedTopic},
		"m.room.avatar/": avatarEventContent,
		"m.room.guest_access/": {guest_access: "can_join"},
		"m.room.history_visibility/": {history_visibility},
		[`m.space.parent/${spaceID}`]: {
			via: [reg.ooye.server_name],
			canonical: true
		},
		"m.room.join_rules/": {
			join_rule: "restricted",
			allow: [{
				type: "m.room_membership",
				room_id: spaceID
			}]
		},
		"m.room.power_levels/": {
			events: {
				"m.room.avatar": 0
			}
		}
	}

	return {spaceID, channelKState}
}

/**
 * Create a bridge room, store the relationship in the database, and add it to the guild's space.
 * @param {DiscordTypes.APIGuildTextChannel} channel
 * @param guild
 * @param {string} spaceID
 * @param {any} kstate
 * @returns {Promise<string>} room ID
 */
async function createRoom(channel, guild, spaceID, kstate) {
	let threadParent = null
	if (channel.type === DiscordTypes.ChannelType.PublicThread) threadParent = channel.parent_id
	const invite = threadParent ? [] : ["@cadence:cadence.moe"] // TODO

	const roomID = await postApplyPowerLevels(kstate, async kstate => {
		const [convertedName, convertedTopic] = convertNameAndTopic(channel, guild, null)
		const roomID = await api.createRoom({
			name: convertedName,
			topic: convertedTopic,
			preset: "private_chat",
			visibility: "private",
			invite,
			initial_state: ks.kstateToState(kstate)
		})

		db.prepare("INSERT INTO channel_room (channel_id, room_id, name, nick, thread_parent) VALUES (?, ?, ?, NULL, ?)").run(channel.id, roomID, channel.name, threadParent)

		return roomID
	})

	// Put the newly created child into the space, no need to await this
	_syncSpaceMember(channel, spaceID, roomID)

	return roomID
}

/**
 * Handling power levels separately. The spec doesn't specify what happens, Dendrite differs,
 * and Synapse does an absolutely insane *shallow merge* of what I provide on top of what it creates.
 * We don't want the `events` key to be overridden completely.
 * https://github.com/matrix-org/synapse/blob/develop/synapse/handlers/room.py#L1170-L1210
 * https://github.com/matrix-org/matrix-spec/issues/492
 * @param {any} kstate
 * @param {(_: any) => Promise<string>} callback must return room ID
 * @returns {Promise<string>} room ID
 */
async function postApplyPowerLevels(kstate, callback) {
	const powerLevelContent = kstate["m.room.power_levels/"]
	const kstateWithoutPowerLevels = {...kstate}
	delete kstateWithoutPowerLevels["m.room.power_levels/"]

	/** @type {string} */
	const roomID = await callback(kstateWithoutPowerLevels)

	// Now *really* apply the power level overrides on top of what Synapse *really* set
	if (powerLevelContent) {
		const newRoomKState = await roomToKState(roomID)
		const newRoomPowerLevelsDiff = ks.diffKState(newRoomKState, {"m.room.power_levels/": powerLevelContent})
		await applyKStateDiffToRoom(roomID, newRoomPowerLevelsDiff)
	}

	return roomID
}

/**
 * @param {DiscordTypes.APIGuildChannel} channel
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
	/** @ts-ignore @type {DiscordTypes.APIGuildChannel} */
	const channel = discord.channels.get(channelID)
	assert.ok(channel)
	const guild = channelToGuild(channel)

	if (inflightRoomCreate.has(channelID)) {
		await inflightRoomCreate.get(channelID) // just waiting, and then doing a new db query afterwards, is the simplest way of doing it
	}

	/** @type {{room_id: string, thread_parent: string?}} */
	const existing = db.prepare("SELECT room_id, thread_parent from channel_room WHERE channel_id = ?").get(channelID)

	if (!existing) {
		const creation = (async () => {
			const {spaceID, channelKState} = await channelToKState(channel, guild)
			const roomID = await createRoom(channel, guild, spaceID, channelKState)
			inflightRoomCreate.delete(channelID) // OK to release inflight waiters now. they will read the correct `existing` row
			return roomID
		})()
		inflightRoomCreate.set(channelID, creation)
		return creation // Naturally, the newly created room is already up to date, so we can always skip syncing here.
	}

	const roomID = existing.room_id

	if (!shouldActuallySync) {
		return existing.room_id // only need to ensure room exists, and it does. return the room ID
	}

	console.log(`[room sync] to matrix: ${channel.name}`)

	const {spaceID, channelKState} = await channelToKState(channel, guild)

	// sync channel state to room
	const roomKState = await roomToKState(roomID)
	const roomDiff = ks.diffKState(roomKState, channelKState)
	const roomApply = applyKStateDiffToRoom(roomID, roomDiff)
	db.prepare("UPDATE channel_room SET name = ? WHERE room_id = ?").run(channel.name, roomID)

	// sync room as space member
	const spaceApply = _syncSpaceMember(channel, spaceID, roomID)
	await Promise.all([roomApply, spaceApply])

	return roomID
}

async function _unbridgeRoom(channelID) {
	/** @ts-ignore @type {DiscordTypes.APIGuildChannel} */
	const channel = discord.channels.get(channelID)
	assert.ok(channel)
	const roomID = db.prepare("SELECT room_id from channel_room WHERE channel_id = ?").pluck().get(channelID)
	assert.ok(roomID)
	const spaceID = db.prepare("SELECT space_id FROM guild_space WHERE guild_id = ?").pluck().get(channel.guild_id)
	assert.ok(spaceID)

	// remove room from being a space member
	await api.sendState(spaceID, "m.space.child", roomID, {})

	// send a notification in the room
	await api.sendEvent(roomID, "m.room.message", {
		msgtype: "m.notice",
		body: "⚠️ This room was removed from the bridge."
	})

	// leave room
	await api.leaveRoom(roomID)

	// delete room from database
	const {changes} = db.prepare("DELETE FROM channel_room WHERE room_id = ? AND channel_id = ?").run(roomID, channelID)
	assert.equal(changes, 1)
}


/**
 * @param {DiscordTypes.APIGuildTextChannel} channel
 * @param {string} spaceID
 * @param {string} roomID
 * @returns {Promise<string[]>}
 */
async function _syncSpaceMember(channel, spaceID, roomID) {
	const spaceKState = await roomToKState(spaceID)
	let spaceEventContent = {}
	if (
		channel.type !== DiscordTypes.ChannelType.PrivateThread // private threads do not belong in the space (don't offer people something they can't join)
		&& !channel["thread_metadata"]?.archived // archived threads do not belong in the space (don't offer people conversations that are no longer relevant)
	) {
		spaceEventContent = {
			via: [reg.ooye.server_name]
		}
	}
	const spaceDiff = ks.diffKState(spaceKState, {
		[`m.space.child/${roomID}`]: spaceEventContent
	})
	return applyKStateDiffToRoom(spaceID, spaceDiff)
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
		const allowedTypes = [DiscordTypes.ChannelType.GuildText, DiscordTypes.ChannelType.PublicThread]
		// @ts-ignore
		if (allowedTypes.includes(discord.channels.get(channelID)?.type)) {
			const roomID = await syncRoom(channelID)
			console.log(`synced ${channelID} <-> ${roomID}`)
		}
	}
}

module.exports.createRoom = createRoom
module.exports.ensureRoom = ensureRoom
module.exports.syncRoom = syncRoom
module.exports.createAllForGuild = createAllForGuild
module.exports.channelToKState = channelToKState
module.exports.roomToKState = roomToKState
module.exports.applyKStateDiffToRoom = applyKStateDiffToRoom
module.exports.postApplyPowerLevels = postApplyPowerLevels
module.exports._convertNameAndTopic = convertNameAndTopic
module.exports._unbridgeRoom = _unbridgeRoom
