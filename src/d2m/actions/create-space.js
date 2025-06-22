// @ts-check

const assert = require("assert").strict
const {isDeepStrictEqual} = require("util")
const DiscordTypes = require("discord-api-types/v10")
const Ty = require("../../types")
const {reg} = require("../../matrix/read-registration")

const passthrough = require("../../passthrough")
const {discord, sync, db, select} = passthrough
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")
/** @type {import("./create-room")} */
const createRoom = sync.require("./create-room")
/** @type {import("./expression")} */
const expression = sync.require("./expression")
/** @type {import("../../matrix/kstate")} */
const ks = sync.require("../../matrix/kstate")

/** @type {Map<string, Promise<string>>} guild ID -> Promise<space ID> */
const inflightSpaceCreate = new Map()

/**
 * @param {DiscordTypes.RESTGetAPIGuildResult} guild
 * @param {any} kstate
 */
async function createSpace(guild, kstate) {
	const name = kstate["m.room.name/"].name
	const topic = kstate["m.room.topic/"]?.topic || undefined
	assert(name)

	const memberCount = guild["member_count"] ?? guild.approximate_member_count ?? 0
	const enablePresenceByDefault = +(memberCount < 50) // scary! all active users in a presence-enabled guild will be pinging the server every <30 seconds to stay online
	const globalAdmins = select("member_power", "mxid", {room_id: "*"}).pluck().all()

	const roomID = await createRoom.postApplyPowerLevels(kstate, async kstate => {
		return api.createRoom({
			name,
			preset: createRoom.PRIVACY_ENUMS.PRESET[createRoom.DEFAULT_PRIVACY_LEVEL], // New spaces will have to use the default privacy level; we obviously can't look up the existing entry
			visibility: createRoom.PRIVACY_ENUMS.VISIBILITY[createRoom.DEFAULT_PRIVACY_LEVEL],
			power_level_content_override: {
				events_default: 100, // space can only be managed by bridge
				invite: 0 // any existing member can invite others
			},
			invite: globalAdmins,
			topic,
			creation_content: {
				type: "m.space"
			},
			initial_state: await ks.kstateToState(kstate)
		})
	})
	db.prepare("INSERT INTO guild_space (guild_id, space_id, presence) VALUES (?, ?, ?)").run(guild.id, roomID, enablePresenceByDefault)
	return roomID
}

/**
 * @param {DiscordTypes.APIGuild} guild
 * @param {number} privacyLevel
 */
async function guildToKState(guild, privacyLevel) {
	assert.equal(typeof privacyLevel, "number")
	const globalAdmins = select("member_power", ["mxid", "power_level"], {room_id: "*"}).all()
	const guildKState = {
		"m.room.name/": {name: guild.name},
		"m.room.avatar/": {
			$if: guild.icon,
			url: {$url: file.guildIcon(guild)}
		},
		"m.room.guest_access/": {guest_access: createRoom.PRIVACY_ENUMS.GUEST_ACCESS[privacyLevel]},
		"m.room.history_visibility/": {history_visibility: createRoom.PRIVACY_ENUMS.SPACE_HISTORY_VISIBILITY[privacyLevel]},
		"m.room.join_rules/": {join_rule: createRoom.PRIVACY_ENUMS.SPACE_JOIN_RULES[privacyLevel]},
		"m.room.power_levels/": {users: globalAdmins.reduce((a, c) => (a[c.mxid] = c.power_level, a), {})} // used in guild initial creation postApplyPowerLevels
	}

	return guildKState
}

/**
 * @param {DiscordTypes.APIGuild} guild
 * @param {boolean} shouldActuallySync false if just need to ensure nspace exists (which is a quick database check),
 *                                     true if also want to efficiently sync space name, space avatar, and child room avatars
 * @returns {Promise<string>} room ID
 */
async function _syncSpace(guild, shouldActuallySync) {
	assert.ok(guild)

	if (inflightSpaceCreate.has(guild.id)) {
		await inflightSpaceCreate.get(guild.id) // just waiting, and then doing a new db query afterwards, is the simplest way of doing it
	}

	const row = select("guild_space", ["space_id", "privacy_level"], {guild_id: guild.id}).get()

	if (!row) {
		const autocreate = select("guild_active", "autocreate", {guild_id: guild.id}).pluck().get()
		assert.equal(autocreate, 1, `refusing to implicitly create a space for guild ${guild.id}. set the guild_active data first before calling ensureSpace/syncSpace.`)

		const creation = (async () => {
			const guildKState = await guildToKState(guild, createRoom.DEFAULT_PRIVACY_LEVEL) // New spaces will have to use the default privacy level; we obviously can't look up the existing entry
			const spaceID = await createSpace(guild, guildKState)
			inflightSpaceCreate.delete(guild.id)
			return spaceID
		})()
		inflightSpaceCreate.set(guild.id, creation)
		return creation // Naturally, the newly created space is already up to date, so we can always skip syncing here.
	}

	const {space_id: spaceID, privacy_level} = row

	if (!shouldActuallySync) {
		return spaceID // only need to ensure space exists, and it does. return the space ID
	}

	console.log(`[space sync] to matrix: ${guild.name}`)

	const guildKState = await guildToKState(guild, privacy_level) // calling this in both branches because we don't want to calculate this if not syncing

	// sync guild state to space
	const spaceKState = await ks.roomToKState(spaceID)
	const spaceDiff = ks.diffKState(spaceKState, guildKState)
	await ks.applyKStateDiffToRoom(spaceID, spaceDiff)

	// guild icon was changed, so room avatars need to be updated as well as the space ones
	// doing it this way rather than calling syncRoom for great efficiency gains
	const newAvatarState = spaceDiff["m.room.avatar/"]
	if (guild.icon && newAvatarState?.url) {
		// don't try to update rooms with custom avatars though
		const roomsWithCustomAvatars = select("channel_room", "room_id", {}, "WHERE custom_avatar IS NOT NULL").pluck().all()

		for await (const room of api.generateFullHierarchy(spaceID)) {
			if (room.avatar_url === newAvatarState.url) continue
			if (roomsWithCustomAvatars.includes(room.room_id)) continue
			await api.sendState(room.room_id, "m.room.avatar", "", newAvatarState)
		}
	}

	return spaceID
}

/**
 * Ensures the space exists. If it doesn't, creates the space with an accurate initial state.
 * @param {DiscordTypes.APIGuild} guild
 */
function ensureSpace(guild) {
	return _syncSpace(guild, false)
}

/**
 * Actually syncs. Efficiently updates the space name, space avatar, and child room avatars.
 * @param {DiscordTypes.APIGuild} guild
 */
function syncSpace(guild) {
	return _syncSpace(guild, true)
}

/**
 * Inefficiently force the space and its existing child rooms to be fully updated.
 * Prefer not to call this as part of the bridge's normal operation.
 */
async function syncSpaceFully(guildID) {
	/** @ts-ignore @type {DiscordTypes.APIGuild} */
	const guild = discord.guilds.get(guildID)
	assert.ok(guild)

	const row = select("guild_space", ["space_id", "privacy_level"], {guild_id: guildID}).get()

	if (!row) {
		const guildKState = await guildToKState(guild, createRoom.DEFAULT_PRIVACY_LEVEL)
		const spaceID = await createSpace(guild, guildKState)
		return spaceID // Naturally, the newly created space is already up to date, so we can always skip syncing here.
	}

	const {space_id: spaceID, privacy_level} = row

	console.log(`[space sync] to matrix: ${guild.name}`)

	const guildKState = await guildToKState(guild, privacy_level)

	// sync guild state to space
	const spaceKState = await ks.roomToKState(spaceID)
	const spaceDiff = ks.diffKState(spaceKState, guildKState)
	await ks.applyKStateDiffToRoom(spaceID, spaceDiff)

	const childRooms = await api.getFullHierarchy(spaceID)

	for (const {room_id} of childRooms) {
		const channelID = select("channel_room", "channel_id", {room_id}).pluck().get()
		if (!channelID) continue
		if (discord.channels.has(channelID)) {
			await createRoom.syncRoom(channelID)
		} else {
			await createRoom.unbridgeDeletedChannel({id: channelID}, guildID)
		}
	}

	return spaceID
}

/**
 * @param {DiscordTypes.GatewayGuildEmojisUpdateDispatchData | DiscordTypes.GatewayGuildStickersUpdateDispatchData} data
 * @param {boolean} checkBeforeSync false to always send new state, true to check the current state and only apply if state would change
 */
async function syncSpaceExpressions(data, checkBeforeSync) {
	// No need for kstate here. Each of these maps to a single state event, which will always overwrite what was there before. I can just send the state event.

	const spaceID = select("guild_space", "space_id", {guild_id: data.guild_id}).pluck().get()
	if (!spaceID) return

	/**
	 * @typedef {DiscordTypes.GatewayGuildEmojisUpdateDispatchData & DiscordTypes.GatewayGuildStickersUpdateDispatchData} Expressions
	 * @param {string} spaceID
	 * @param {Expressions extends any ? keyof Expressions : never} key
	 * @param {string} eventKey
	 * @param {typeof expression["emojisToState"] | typeof expression["stickersToState"]} fn
	 */
	async function update(spaceID, key, eventKey, fn) {
		if (!(key in data) || !data[key].length) return
		const content = await fn(data[key])
		if (checkBeforeSync) {
			let existing
			try {
				existing = await api.getStateEvent(spaceID, "im.ponies.room_emotes", eventKey)
			} catch (e) {
				// State event not found. This space doesn't have any existing emojis. We create a dummy empty event for comparison's sake.
				existing = fn([])
			}
			if (isDeepStrictEqual(existing, content)) return
		}
		await api.sendState(spaceID, "im.ponies.room_emotes", eventKey, content)
	}

	await update(spaceID, "emojis", "moe.cadence.ooye.pack.emojis", expression.emojisToState)
	await update(spaceID, "stickers", "moe.cadence.ooye.pack.stickers", expression.stickersToState)
}

module.exports.createSpace = createSpace
module.exports.ensureSpace = ensureSpace
module.exports.syncSpace = syncSpace
module.exports.syncSpaceFully = syncSpaceFully
module.exports.guildToKState = guildToKState
module.exports.syncSpaceExpressions = syncSpaceExpressions
