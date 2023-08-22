// @ts-check

const assert = require("assert")
const DiscordTypes = require("discord-api-types/v10")

const passthrough = require("../../passthrough")
const { sync, db } = passthrough
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")
/** @type {import("./create-room")} */
const createRoom = sync.require("./create-room")

/**
 * @param {import("discord-api-types/v10").RESTGetAPIGuildResult} guild
 * @param {any} kstate
 */
async function createSpace(guild, kstate) {
	const name = kstate["m.room.name/"].name
	const topic = kstate["m.room.topic/"]?.topic || undefined

	assert(name)

	const roomID = await api.createRoom({
		name,
		preset: "private_chat", // cannot join space unless invited
		visibility: "private",
		power_level_content_override: {
			events_default: 100, // space can only be managed by bridge
			invite: 0 // any existing member can invite others
		},
		invite: ["@cadence:cadence.moe"], // TODO
		topic,
		creation_content: {
			type: "m.space"
		},
		initial_state: ks.kstateToState(kstate)
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
		"m.room.history_visibility": {history_visibility: "invited"} // any events sent after user was invited are visible
	}

	return guildKState
}

async function syncSpace(guildID) {
	/** @ts-ignore @type {DiscordTypes.APIGuild} */
	const guild = discord.guilds.get(guildID)
	assert.ok(guild)

	/** @type {{room_id: string, thread_parent: string?}} */
	const existing = db.prepare("SELECT space_id from guild_space WHERE guild_id = ?").get(guildID)

	const guildKState = await guildToKState(guild)

	if (!existing) {
		const spaceID = await createSpace(guild, guildKState)
		return spaceID
	}




module.exports.createSpace = createSpace
