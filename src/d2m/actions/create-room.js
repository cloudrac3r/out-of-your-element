// @ts-check

const assert = require("assert").strict
const DiscordTypes = require("discord-api-types/v10")
const Ty = require("../../types")
const {reg} = require("../../matrix/read-registration")

const passthrough = require("../../passthrough")
const {discord, sync, db, select, from} = passthrough
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("../../matrix/mreq")} */
const mreq = sync.require("../../matrix/mreq")
/** @type {import("../../matrix/kstate")} */
const ks = sync.require("../../matrix/kstate")
/** @type {import("../../discord/utils")} */
const dUtils = sync.require("../../discord/utils")
/** @type {import("../../m2d/converters/utils")} */
const mUtils = sync.require("../../m2d/converters/utils")
/** @type {import("./create-space")} */
const createSpace = sync.require("./create-space")

/**
 * There are 3 levels of room privacy:
 * 0: Room is invite-only.
 * 1: Anybody can use a link to join.
 * 2: Room is published in room directory.
 */
const PRIVACY_ENUMS = {
	PRESET: ["private_chat", "public_chat", "public_chat"],
	VISIBILITY: ["private", "private", "private"],
	SPACE_HISTORY_VISIBILITY: ["invited", "world_readable", "world_readable"], // copying from element client
	ROOM_HISTORY_VISIBILITY: ["shared", "shared", "world_readable"], // any events sent after <value> are visible, but for world_readable anybody can read without even joining
	GUEST_ACCESS: ["can_join", "forbidden", "forbidden"], // whether guests can join space if other conditions are met
	SPACE_JOIN_RULES: ["invite", "public", "public"],
	ROOM_JOIN_RULES: ["restricted", "public", "public"]
}

const DEFAULT_PRIVACY_LEVEL = 0

const READ_ONLY_ROOM_EVENTS_DEFAULT_POWER = 50

/** @type {Map<string, Promise<string>>} channel ID -> Promise<room ID> */
const inflightRoomCreate = new Map()

/**
 * @param {{id: string, name: string, topic?: string?, type: number, parent_id?: string?}} channel
 * @param {{id: string}} guild
 * @param {string | null | undefined} customName
 */
function convertNameAndTopic(channel, guild, customName) {
	// @ts-ignore
	const parentChannel = discord.channels.get(channel.parent_id)
	let channelPrefix =
		( parentChannel?.type === DiscordTypes.ChannelType.GuildForum ? ""
		: channel.type === DiscordTypes.ChannelType.PublicThread ? "[⛓️] "
		: channel.type === DiscordTypes.ChannelType.AnnouncementThread ? "[⛓️] "
		: channel.type === DiscordTypes.ChannelType.PrivateThread ? "[🔒⛓️] "
		: channel.type === DiscordTypes.ChannelType.GuildVoice ? "[🔊] "
		: "")
	const chosenName = customName || (channelPrefix + channel.name);
	const maybeTopicWithPipe = channel.topic ? ` | ${channel.topic}` : '';
	const maybeTopicWithNewlines = channel.topic ? `${channel.topic}\n\n` : '';
	const channelIDPart = `Channel ID: ${channel.id}`;
	const guildIDPart = `Guild ID: ${guild.id}`;

	const convertedTopic = customName
		 ? `#${channel.name}${maybeTopicWithPipe}\n\n${channelIDPart}\n${guildIDPart}`
		 : `${maybeTopicWithNewlines}${channelIDPart}\n${guildIDPart}`;

	return [chosenName, convertedTopic];
}

/**
 * Async because it may create the guild and/or upload the guild icon to mxc.
 * @param {DiscordTypes.APIGuildTextChannel | DiscordTypes.APIThreadChannel} channel
 * @param {DiscordTypes.APIGuild} guild
 * @param {{api: {getStateEvent: typeof api.getStateEvent}}} di simple-as-nails dependency injection for the matrix API
 */
async function channelToKState(channel, guild, di) {
	// @ts-ignore
	const parentChannel = discord.channels.get(channel.parent_id)

	/** Used for membership/permission checks. */
	const guildSpaceID = await createSpace.ensureSpace(guild)
	/** Used as the literal parent on Matrix, for categorisation. Will be the same as `guildSpaceID` unless it's a forum channel's thread, in which case a different space is used to group those threads. */
	let parentSpaceID = guildSpaceID
	if (parentChannel?.type === DiscordTypes.ChannelType.GuildForum) {
		parentSpaceID = await ensureRoom(channel.parent_id)
		assert(typeof parentSpaceID === "string")
	}

	const channelRow = select("channel_room", ["nick", "custom_avatar", "custom_topic"], {channel_id: channel.id}).get()
	const customName = channelRow?.nick
	const customAvatar = channelRow?.custom_avatar
	const hasCustomTopic = channelRow?.custom_topic
	const [convertedName, convertedTopic] = convertNameAndTopic(channel, guild, customName)

	const avatarEventContent = {}
	if (customAvatar) {
		avatarEventContent.url = customAvatar
	} else if (guild.icon) {
		avatarEventContent.url = {$url: file.guildIcon(guild)}
	}

	const privacyLevel = select("guild_space", "privacy_level", {guild_id: guild.id}).pluck().get()
	assert(privacyLevel != null) // already ensured the space exists
	let history_visibility = PRIVACY_ENUMS.ROOM_HISTORY_VISIBILITY[privacyLevel]
	if (channel["thread_metadata"]) history_visibility = "world_readable"

	/** @type {{join_rule: string, allow?: any}} */
	let join_rules = {
		join_rule: "restricted",
		allow: [{
			type: "m.room_membership",
			room_id: guildSpaceID
		}]
	}
	if (PRIVACY_ENUMS.ROOM_JOIN_RULES[privacyLevel] !== "restricted") {
		join_rules = {join_rule: PRIVACY_ENUMS.ROOM_JOIN_RULES[privacyLevel]}
	}

	const everyonePermissions = dUtils.getPermissions([], guild.roles, undefined, channel.permission_overwrites)
	const everyoneCanSend = dUtils.hasPermission(everyonePermissions, DiscordTypes.PermissionFlagsBits.SendMessages)
	const everyoneCanMentionEveryone = dUtils.hasAllPermissions(everyonePermissions, ["MentionEveryone"])

	const globalAdmins = select("member_power", ["mxid", "power_level"], {room_id: "*"}).all()
	const globalAdminPower = globalAdmins.reduce((a, c) => (a[c.mxid] = c.power_level, a), {})

	/** @type {Ty.Event.M_Power_Levels} */
	const spacePowerEvent = await di.api.getStateEvent(guildSpaceID, "m.room.power_levels", "")
	const spacePower = spacePowerEvent.users

	/** @type {any} */
	const channelKState = {
		"m.room.name/": {name: convertedName},
		"m.room.topic/": {topic: convertedTopic},
		"m.room.avatar/": avatarEventContent,
		"m.room.guest_access/": {guest_access: PRIVACY_ENUMS.GUEST_ACCESS[privacyLevel]},
		"m.room.history_visibility/": {history_visibility},
		[`m.space.parent/${parentSpaceID}`]: {
			via: [reg.ooye.server_name],
			canonical: true
		},
		/** @type {{join_rule: string, [x: string]: any}} */
		"m.room.join_rules/": join_rules,
		/** @type {Ty.Event.M_Power_Levels} */
		"m.room.power_levels/": {
			events_default: everyoneCanSend ? 0 : READ_ONLY_ROOM_EVENTS_DEFAULT_POWER,
			events: {
				"m.reaction": 0,
				"m.room.redaction": 0 // only affects redactions of own events, required to be able to un-react
			},
			notifications: {
				room: everyoneCanMentionEveryone ? 0 : 20
			},
			users: {...spacePower, ...globalAdminPower}
		},
		"chat.schildi.hide_ui/read_receipts": {
		},
		[`uk.half-shot.bridge/moe.cadence.ooye://discord/${guild.id}/${channel.id}`]: {
			bridgebot: `@${reg.sender_localpart}:${reg.ooye.server_name}`,
			protocol: {
				id: "discord",
				displayname: "Discord"
			},
			network: {
				id: guild.id,
				displayname: guild.name,
				avatar_url: {$url: file.guildIcon(guild)}
			},
			channel: {
				id: channel.id,
				displayname: channel.name,
				external_url: `https://discord.com/channels/${guild.id}/${channel.id}`
			}
		}
	}

	// Don't overwrite room topic if the topic has been customised
	if (hasCustomTopic) delete channelKState["m.room.topic/"]

	// Don't add a space parent if it's self service
	// (The person setting up self-service has already put it in their preferred space to be able to get this far.)
	const autocreate = select("guild_active", "autocreate", {guild_id: guild.id}).pluck().get()
	if (autocreate === 0 && ![DiscordTypes.ChannelType.PrivateThread, DiscordTypes.ChannelType.PublicThread, DiscordTypes.ChannelType.AnnouncementThread].includes(channel.type)) {
		delete channelKState[`m.space.parent/${parentSpaceID}`]
	}

	return {spaceID: parentSpaceID, privacyLevel, channelKState}
}

/**
 * Create a bridge room, store the relationship in the database, and add it to the guild's space.
 * @param {DiscordTypes.APIGuildTextChannel} channel
 * @param guild
 * @param {string} spaceID
 * @param {any} kstate
 * @param {number} privacyLevel
 * @returns {Promise<string>} room ID
 */
async function createRoom(channel, guild, spaceID, kstate, privacyLevel) {
	let threadParent = null
	if (channel.type === DiscordTypes.ChannelType.PublicThread) threadParent = channel.parent_id

	let spaceCreationContent = {}
	if (channel.type === DiscordTypes.ChannelType.GuildForum) spaceCreationContent = {creation_content: {type: "m.space"}}

	// Name and topic can be done earlier in room creation rather than in initial_state
	// https://spec.matrix.org/latest/client-server-api/#creation
	const name = kstate["m.room.name/"].name
	delete kstate["m.room.name/"]
	assert(name)
	const topic = kstate["m.room.topic/"].topic
	delete kstate["m.room.topic/"]
	assert(topic)

	const roomID = await postApplyPowerLevels(kstate, async kstate => {
		const roomID = await api.createRoom({
			name,
			topic,
			preset: PRIVACY_ENUMS.PRESET[privacyLevel], // This is closest to what we want, but properties from kstate override it anyway
			visibility: PRIVACY_ENUMS.VISIBILITY[privacyLevel],
			invite: [],
			initial_state: await ks.kstateToState(kstate),
			...spaceCreationContent
		})

		db.prepare("INSERT INTO channel_room (channel_id, room_id, name, nick, thread_parent) VALUES (?, ?, ?, NULL, ?)").run(channel.id, roomID, channel.name, threadParent)

		return roomID
	})

	// Put the newly created child into the space
	await _syncSpaceMember(channel, spaceID, roomID, guild.id)

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
	delete kstateWithoutPowerLevels["chat.schildi.hide_ui/read_receipts"]

	/** @type {string} */
	const roomID = await callback(kstateWithoutPowerLevels)

	// Now *really* apply the power level overrides on top of what Synapse *really* set
	if (powerLevelContent) {
		const newRoomKState = await ks.roomToKState(roomID)
		const newRoomPowerLevelsDiff = ks.diffKState(newRoomKState, {"m.room.power_levels/": powerLevelContent})
		await ks.applyKStateDiffToRoom(roomID, newRoomPowerLevelsDiff)
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

/**
 * This function handles whether it's allowed to bridge messages in this channel, and if so, where to.
 * This has to account for whether self-service is enabled for the guild or not.
 * This also has to account for different channel types, like forum channels (which need the
 * parent forum to already exist, and ignore the self-service setting), or thread channels (which
 * need the parent channel to already exist, and ignore the self-service setting).
 * @param {DiscordTypes.APIGuildTextChannel | DiscordTypes.APIThreadChannel} channel text channel or thread
 * @param {string} guildID
 * @returns obj if bridged; 1 if autocreatable; null/undefined if guild is not bridged; 0 if self-service and not autocreatable thread
 */
function existsOrAutocreatable(channel, guildID) {
	// 1. If the channel is already linked somewhere, it's always okay to bridge to that destination, no matter what. Yippee!
	const existing = select("channel_room", ["room_id", "thread_parent"], {channel_id: channel.id}).get()
	if (existing) return existing

	// 2. If the guild is an autocreate guild, it's always okay to bridge to that destination, and
	// we'll need to create any dependent resources recursively.
	const autocreate = select("guild_active", "autocreate", {guild_id: guildID}).pluck().get()
	if (autocreate === 1) return autocreate

	// 3. If the guild is not approved for bridging yet, we can't bridge there.
	// They need to decide one way or another whether it's self-service before we can continue.
	if (autocreate == null) return autocreate

	// 4. If we got here, the guild is in self-service mode.
	// New channels won't be able to create new rooms. But forum threads or channel threads could be fine.
	if ([DiscordTypes.ChannelType.PublicThread, DiscordTypes.ChannelType.PrivateThread, DiscordTypes.ChannelType.AnnouncementThread].includes(channel.type)) {
		// In self-service mode, threads rely on the parent resource already existing.
		/** @type {DiscordTypes.APIGuildTextChannel} */ // @ts-ignore
		const parent = discord.channels.get(channel.parent_id)
		assert(parent)
		const parentExisting = existsOrAutocreatable(parent, guildID)
		if (parentExisting) return 1 // Autocreatable
	}

	// 5. If we got here, the guild is in self-service mode and the channel is truly not bridged.
	return autocreate
}

/**
 * @param {DiscordTypes.APIGuildTextChannel | DiscordTypes.APIThreadChannel} channel text channel or thread
 * @param {string} guildID
 * @returns obj if bridged; 1 if autocreatable. (throws if not autocreatable)
 */
function assertExistsOrAutocreatable(channel, guildID) {
	const existing = existsOrAutocreatable(channel, guildID)
	if (existing === 0) {
		throw new Error(`Guild ${guildID} is self-service, so won't create a Matrix room for channel ${channel.id}`)
	}
	if (!existing) {
		throw new Error(`Guild ${guildID} is not bridged, so won't create a Matrix room for channel ${channel.id}`)
	}
	return existing
}

/*
	Ensure flow:
	1. Get IDs
	2. Does room exist? If so great!
	(it doesn't, so it needs to be created)
	3. Get kstate for channel
	4. Create room, return new ID

	Ensure + sync flow:
	1. Get IDs
	2. Does room exist?
	2.5: If room does exist AND wasn't asked to sync: return here
	3. Get kstate for channel
	4. Create room with kstate if room doesn't exist
	5. Get and update room state with kstate if room does exist
*/

/**
 * Create room and/or sync room data. Please check that a channel_room entry exists or autocreate = 1 before calling this.
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

	const existing = assertExistsOrAutocreatable(channel, guild.id)

	if (existing === 1) {
		const creation = (async () => {
			const {spaceID, privacyLevel, channelKState} = await channelToKState(channel, guild, {api})
			const roomID = await createRoom(channel, guild, spaceID, channelKState, privacyLevel)
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

	const {spaceID, channelKState} = await channelToKState(channel, guild, {api}) // calling this in both branches because we don't want to calculate this if not syncing

	// sync channel state to room
	const roomKState = await ks.roomToKState(roomID)
	if (+roomKState["m.room.create/"].room_version <= 8) {
		// join_rule `restricted` is not available in room version < 8 and not working properly in version == 8
		// read more: https://spec.matrix.org/v1.8/rooms/v9/
		// we have to use `public` instead, otherwise the room will be unjoinable.
		channelKState["m.room.join_rules/"] = {join_rule: "public"}
	}
	const roomDiff = ks.diffKState(roomKState, channelKState)
	const roomApply = ks.applyKStateDiffToRoom(roomID, roomDiff)
	db.prepare("UPDATE channel_room SET name = ? WHERE room_id = ?").run(channel.name, roomID)

	// sync room as space member
	const spaceApply = _syncSpaceMember(channel, spaceID, roomID, guild.id)
	await Promise.all([roomApply, spaceApply])

	return roomID
}

/** Ensures the room exists. If it doesn't, creates the room with an accurate initial state. Please check that a channel_room entry exists or guild autocreate = 1 before calling this. */
function ensureRoom(channelID) {
	return _syncRoom(channelID, false)
}

/** Actually syncs. Gets all room state from the homeserver in order to diff, and uploads the icon to mxc if it has changed. Please check that a channel_room entry exists or guild autocreate = 1 before calling this. */
function syncRoom(channelID) {
	return _syncRoom(channelID, true)
}

async function unbridgeChannel(channelID) {
	/** @ts-ignore @type {DiscordTypes.APIGuildChannel} */
	const channel = discord.channels.get(channelID)
	assert.ok(channel)
	assert.ok(channel.guild_id)
	return unbridgeDeletedChannel(channel, channel.guild_id)
}

/**
 * @param {{id: string, topic?: string?}} channel channel-ish (just needs an id, topic is optional)
 * @param {string} guildID
 */
async function unbridgeDeletedChannel(channel, guildID) {
	const roomID = select("channel_room", "room_id", {channel_id: channel.id}).pluck().get()
	assert.ok(roomID)
	const row = from("guild_space").join("guild_active", "guild_id").select("space_id", "autocreate").get()
	assert.ok(row)

	let botInRoom = true

	// remove declaration that the room is bridged
	try {
		await api.sendState(roomID, "uk.half-shot.bridge", `moe.cadence.ooye://discord/${guildID}/${channel.id}`, {})
	} catch (e) {
		if (String(e).includes("not in room")) {
			botInRoom = false
		} else {
			throw e
		}
	}

	if (botInRoom && "topic" in channel) {
		// previously the Matrix topic would say the channel ID. we should remove that
		await api.sendState(roomID, "m.room.topic", "", {topic: channel.topic || ""})
	}

	// delete webhook on discord
	const webhook = select("webhook", ["webhook_id", "webhook_token"], {channel_id: channel.id}).get()
	if (webhook) {
		await discord.snow.webhook.deleteWebhook(webhook.webhook_id, webhook.webhook_token)
		db.prepare("DELETE FROM webhook WHERE channel_id = ?").run(channel.id)
	}

	// delete room from database
	db.prepare("DELETE FROM member_cache WHERE room_id = ?").run(roomID)
	db.prepare("DELETE FROM channel_room WHERE room_id = ? AND channel_id = ?").run(roomID, channel.id) // cascades to most other tables, like messages

	if (!botInRoom) return

	// demote admins in room
	/** @type {Ty.Event.M_Power_Levels} */
	const powerLevelContent = await api.getStateEvent(roomID, "m.room.power_levels", "")
	powerLevelContent.users ??= {}
	const bot = `@${reg.sender_localpart}:${reg.ooye.server_name}`
	for (const mxid of Object.keys(powerLevelContent.users)) {
		if (powerLevelContent.users[mxid] >= 100 && mUtils.eventSenderIsFromDiscord(mxid) && mxid !== bot) {
			delete powerLevelContent.users[mxid]
			await api.sendState(roomID, "m.room.power_levels", "", powerLevelContent, mxid)
		}
	}

	// send a notification in the room
	await api.sendEvent(roomID, "m.room.message", {
		msgtype: "m.notice",
		body: "⚠️ This room was removed from the bridge."
	})

	// if it is an easy mode room, clean up the room from the managed space and make it clear it's not being bridged
	// (don't do this for self-service rooms, because they might continue to be used on Matrix or linked somewhere else later)
	if (row.autocreate === 1) {
		// remove room from being a space member
		await api.sendState(roomID, "m.space.parent", row.space_id, {})
		await api.sendState(row.space_id, "m.space.child", roomID, {})
	}

	// if it is a self-service room, remove sim members
	// (the room can be used with less clutter and the member list makes sense if it's bridged somewhere else)
	if (row.autocreate === 0) {
		// remove sim members
		const members = db.prepare("SELECT mxid FROM sim_member WHERE room_id = ? AND mxid <> ?").pluck().all(roomID, bot)
		const preparedDelete = db.prepare("DELETE FROM sim_member WHERE room_id = ? AND mxid = ?")
		for (const mxid of members) {
			await api.leaveRoom(roomID, mxid)
			preparedDelete.run(roomID, mxid)
		}
	}

	// leave room
	await api.leaveRoom(roomID)
}

/**
 * Async because it gets all space state from the homeserver, then if necessary sends one state event back.
 * @param {DiscordTypes.APIGuildTextChannel} channel
 * @param {string} spaceID
 * @param {string} roomID
 * @param {string} guild_id
 * @returns {Promise<string[]>}
 */
async function _syncSpaceMember(channel, spaceID, roomID, guild_id) {
	// If space is self-service then only permit changes to space parenting for threads
	// (The person setting up self-service has already put it in their preferred space to be able to get this far.)
	const autocreate = select("guild_active", "autocreate", {guild_id}).pluck().get()
	if (autocreate === 0 && ![DiscordTypes.ChannelType.PrivateThread, DiscordTypes.ChannelType.PublicThread, DiscordTypes.ChannelType.AnnouncementThread].includes(channel.type)) {
		return []
	}

	const spaceKState = await ks.roomToKState(spaceID)
	let spaceEventContent = {}
	if (
		channel.type !== DiscordTypes.ChannelType.PrivateThread // private threads do not belong in the space (don't offer people something they can't join)
		&& (
			!channel["thread_metadata"]?.archived // archived threads do not belong in the space (don't offer people conversations that are no longer relevant)
			|| discord.channels.get(channel.parent_id || "")?.type === DiscordTypes.ChannelType.GuildForum
		)
	) {
		spaceEventContent = {
			via: [reg.ooye.server_name]
		}
	}
	const spaceDiff = ks.diffKState(spaceKState, {
		[`m.space.child/${roomID}`]: spaceEventContent
	})
	return ks.applyKStateDiffToRoom(spaceID, spaceDiff)
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

module.exports.DEFAULT_PRIVACY_LEVEL = DEFAULT_PRIVACY_LEVEL
module.exports.READ_ONLY_ROOM_EVENTS_DEFAULT_POWER = READ_ONLY_ROOM_EVENTS_DEFAULT_POWER
module.exports.PRIVACY_ENUMS = PRIVACY_ENUMS
module.exports.createRoom = createRoom
module.exports.ensureRoom = ensureRoom
module.exports.syncRoom = syncRoom
module.exports.createAllForGuild = createAllForGuild
module.exports.channelToKState = channelToKState
module.exports.postApplyPowerLevels = postApplyPowerLevels
module.exports._convertNameAndTopic = convertNameAndTopic
module.exports.unbridgeChannel = unbridgeChannel
module.exports.unbridgeDeletedChannel = unbridgeDeletedChannel
module.exports.existsOrAutocreatable = existsOrAutocreatable
module.exports.assertExistsOrAutocreatable = assertExistsOrAutocreatable
