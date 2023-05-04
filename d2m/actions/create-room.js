// @ts-check

const assert = require("assert").strict
const DiscordTypes = require("discord-api-types/v10")

const passthrough = require("../../passthrough")
const { discord, sync, db } = passthrough
/** @type {import("../../matrix/mreq")} */
const mreq = sync.require("../../matrix/mreq")
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")

/**
 * @param {import("discord-api-types/v10").APIGuildTextChannel} channel
 */
async function createRoom(channel) {
	const guildID = channel.guild_id
	assert.ok(guildID)
	const guild = discord.guilds.get(guildID)
	assert.ok(guild)
	const spaceID = db.prepare("SELECT space_id FROM guild_space WHERE guild_id = ?").pluck().get(guildID)
	assert.ok(typeof spaceID === "string")

	const avatarEventContent = {}
	if (guild.icon) {
		avatarEventContent.url = await file.uploadDiscordFileToMxc(file.guildIcon(guild))
	}

	/** @type {import("../../types").R_RoomCreated} */
	const root = await mreq.mreq("POST", "/client/v3/createRoom", {
		name: channel.name,
		topic: channel.topic || undefined,
		preset: "private_chat",
		visibility: "private",
		invite: ["@cadence:cadence.moe"], // TODO
		initial_state: [
			{
				type: "m.room.avatar",
				state_key: "",
				content: avatarEventContent
			},
			{
				type: "m.room.guest_access",
				state_key: "",
				content: {
					guest_access: "can_join"
				}
			},
			{
				type: "m.room.history_visibility",
				state_key: "",
				content: {
					history_visibility: "invited"
				}
			},
			{
				type: "m.space.parent",
				state_key: spaceID,
				content: {
					via: ["cadence.moe"], // TODO: put the proper server here
					canonical: true
				}
			},
			{
				type: "m.room.join_rules",
				content: {
					join_rule: "restricted",
					allow: [{
						type: "m.room.membership",
						room_id: spaceID
					}]
				}
			}
		]
	})

	db.prepare("INSERT INTO channel_room (channel_id, room_id) VALUES (?, ?)").run(channel.id, root.room_id)

	// Put the newly created child into the space
	await mreq.mreq("PUT", `/client/v3/rooms/${spaceID}/state/m.space.child/${root.room_id}`, {
		via: ["cadence.moe"] // TODO: use the proper server
	})
}

async function createAllForGuild(guildID) {
	const channelIDs = discord.guildChannelMap.get(guildID)
	assert.ok(channelIDs)
	for (const channelID of channelIDs) {
		const channel = discord.channels.get(channelID)
		assert.ok(channel)
		const existing = db.prepare("SELECT room_id FROM channel_room WHERE channel_id = ?").pluck().get(channel.id)
		if (channel.type === DiscordTypes.ChannelType.GuildText && !existing) {
			await createRoom(channel)
		}
	}
}

module.exports.createRoom = createRoom
module.exports.createAllForGuild = createAllForGuild
