// @ts-check

const assert = require("assert").strict
const DiscordTypes = require("discord-api-types/v10")
const reg = require("../../matrix/read-registration")

const passthrough = require("../../passthrough")
const { discord, sync, db } = passthrough
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")
/** @type {import("./create-room")} */
const createRoom = sync.require("./create-room")
/** @type {import("../../matrix/kstate")} */
const ks = sync.require("../../matrix/kstate")

/**
 * @param {import("discord-api-types/v10").RESTGetAPIGuildResult} guild
 * @param {any} kstate
 */
async function createSpace(guild, kstate) {
	const name = kstate["m.room.name/"].name
	const topic = kstate["m.room.topic/"]?.topic || undefined
	assert(name)

	const roomID = await createRoom.postApplyPowerLevels(kstate, async kstate => {
		return api.createRoom({
			name,
			preset: "private_chat", // cannot join space unless invited
			visibility: "private",
			power_level_content_override: {
				events_default: 100, // space can only be managed by bridge
				invite: 0 // any existing member can invite others
			},
			invite: reg.ooye.invite,
			topic,
			creation_content: {
				type: "m.space"
			},
			initial_state: ks.kstateToState(kstate)
		})
	})
	db.prepare("INSERT INTO guild_space (guild_id, space_id) VALUES (?, ?)").run(guild.id, roomID)
	return roomID
}

/**
 * @param {DiscordTypes.APIGuild} guild]
 */
async function guildToKState(guild) {
	const avatarEventContent = {}
	if (guild.icon) {
		avatarEventContent.discord_path = file.guildIcon(guild)
		avatarEventContent.url = await file.uploadDiscordFileToMxc(avatarEventContent.discord_path) // TODO: somehow represent future values in kstate (callbacks?), while still allowing for diffing, so test cases don't need to touch the media API
	}

	let history_visibility = "invited"
	if (guild["thread_metadata"]) history_visibility = "world_readable"

	const guildKState = {
		"m.room.name/": {name: guild.name},
		"m.room.avatar/": avatarEventContent,
		"m.room.guest_access/": {guest_access: "can_join"}, // guests can join space if other conditions are met
		"m.room.history_visibility/": {history_visibility: "invited"} // any events sent after user was invited are visible
	}

	return guildKState
}

/** Efficiently update space name, space avatar, and child room avatars. */
async function syncSpace(guildID) {
	/** @ts-ignore @type {DiscordTypes.APIGuild} */
	const guild = discord.guilds.get(guildID)
	assert.ok(guild)

	/** @type {string?} */
	const spaceID = db.prepare("SELECT space_id from guild_space WHERE guild_id = ?").pluck().get(guildID)

	const guildKState = await guildToKState(guild)

	if (!spaceID) {
		const spaceID = await createSpace(guild, guildKState)
		return spaceID // Naturally, the newly created space is already up to date, so we can always skip syncing here.
	}

	console.log(`[space sync] to matrix: ${guild.name}`)

	// sync guild state to space
	const spaceKState = await createRoom.roomToKState(spaceID)
	const spaceDiff = ks.diffKState(spaceKState, guildKState)
	await createRoom.applyKStateDiffToRoom(spaceID, spaceDiff)

	// guild icon was changed, so room avatars need to be updated as well as the space ones
	// doing it this way rather than calling syncRoom for great efficiency gains
	const newAvatarState = spaceDiff["m.room.avatar/"]
	if (guild.icon && newAvatarState?.url) {
		// don't try to update rooms with custom avatars though
		const roomsWithCustomAvatars = db.prepare("SELECT room_id FROM channel_room WHERE custom_avatar IS NOT NULL").pluck().all()

		const childRooms = ks.kstateToState(spaceKState).filter(({type, state_key, content}) => {
			return type === "m.space.child" && "via" in content && !roomsWithCustomAvatars.includes(state_key)
		}).map(({state_key}) => state_key)

		for (const roomID of childRooms) {
			const avatarEventContent = await api.getStateEvent(roomID, "m.room.avatar", "")
			if (avatarEventContent.url !== newAvatarState.url) {
				await api.sendState(roomID, "m.room.avatar", "", newAvatarState)
			}
		}
	}

	return spaceID
}

/**
 * Inefficiently force the space and its existing child rooms to be fully updated.
 * Should not need to be called as part of the bridge's normal operation.
 */
async function syncSpaceFully(guildID) {
	/** @ts-ignore @type {DiscordTypes.APIGuild} */
	const guild = discord.guilds.get(guildID)
	assert.ok(guild)

	/** @type {string?} */
	const spaceID = db.prepare("SELECT space_id from guild_space WHERE guild_id = ?").pluck().get(guildID)

	const guildKState = await guildToKState(guild)

	if (!spaceID) {
		const spaceID = await createSpace(guild, guildKState)
		return spaceID // Naturally, the newly created space is already up to date, so we can always skip syncing here.
	}

	console.log(`[space sync] to matrix: ${guild.name}`)

	// sync guild state to space
	const spaceKState = await createRoom.roomToKState(spaceID)
	const spaceDiff = ks.diffKState(spaceKState, guildKState)
	await createRoom.applyKStateDiffToRoom(spaceID, spaceDiff)

	const childRooms = ks.kstateToState(spaceKState).filter(({type, content}) => {
		return type === "m.space.child" && "via" in content
	}).map(({state_key}) => state_key)

	for (const roomID of childRooms) {
		const channelID = db.prepare("SELECT channel_id FROM channel_room WHERE room_id = ?").pluck().get(roomID)
		if (!channelID) continue
		if (discord.channels.has(channelID)) {
			await createRoom.syncRoom(channelID)
		} else {
			await createRoom.unbridgeDeletedChannel(channelID, guildID)
		}
	}

	return spaceID
}

module.exports.createSpace = createSpace
module.exports.syncSpace = syncSpace
module.exports.syncSpaceFully = syncSpaceFully
module.exports.guildToKState = guildToKState
