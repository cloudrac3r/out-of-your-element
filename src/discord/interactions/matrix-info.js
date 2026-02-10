// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const {discord, sync, select, from} = require("../../passthrough")
const assert = require("assert").strict

/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")

/** @type {import("../../matrix/utils")} */
const utils = sync.require("../../matrix/utils")

/** @type {import("../../web/routes/guild")} */
const webGuild = sync.require("../../web/routes/guild")

/**
 * @param {DiscordTypes.APIMessageApplicationCommandGuildInteraction} interaction
 * @param {{api: typeof api}} di
 * @returns {Promise<DiscordTypes.APIInteractionResponse>}
 */
async function _interact({guild_id, data}, {api}) {
	const message = from("event_message").join("message_room", "message_id").join("historical_channel_room", "historical_room_index")
		.select("source", "reference_channel_id", "room_id", "event_id").where({message_id: data.target_id}).and("ORDER BY part").get()

	if (!message) {
		return {
			type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: "This message hasn't been bridged to Matrix.",
				flags: DiscordTypes.MessageFlags.Ephemeral
			}
		}
	}

	const channel_id = message.reference_channel_id
	const room = select("channel_room", ["name", "nick"], {channel_id}).get()
	assert(room)

	const idInfo = `\n-# Room ID: \`${message.room_id}\`\n-# Event ID: \`${message.event_id}\``
	const roomName = room.nick || room.name

	if (message.source === 1) { // from Discord
		const userID = data.resolved.messages[data.target_id].author.id
		return {
			type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: `Bridged <@${userID}> https://discord.com/channels/${guild_id}/${channel_id}/${data.target_id} on Discord to [${roomName}](<https://matrix.to/#/${message.room_id}/${message.event_id}>) on Matrix.`
					+ idInfo,
				flags: DiscordTypes.MessageFlags.Ephemeral
			}
		}
	}

	// from Matrix
	const event = await api.getEvent(message.room_id, message.event_id)
	const via = await utils.getViaServersQuery(message.room_id, api)
	const inChannels = discord.guildChannelMap.get(guild_id)
		.map(cid => discord.channels.get(cid))
		.sort((a, b) => webGuild._getPosition(a, discord.channels) - webGuild._getPosition(b, discord.channels))
		.filter(channel => from("channel_room").join("member_cache", "room_id").select("mxid").where({channel_id: channel.id, mxid: event.sender}).get())
	const matrixMember = select("member_cache", ["displayname", "avatar_url"], {room_id: message.room_id, mxid: event.sender}).get()
	const name = matrixMember?.displayname || event.sender
	return {
		type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
		data: {
			embeds: [{
				author: {
					name,
					url: `https://matrix.to/#/${event.sender}`,
					icon_url: utils.getPublicUrlForMxc(matrixMember.avatar_url)
				},
				description: `This Matrix message was delivered to Discord by **Out Of Your Element**.\n[View on Matrix →](<https://matrix.to/#/${message.room_id}/${message.event_id}?${via}>)\n\n**User ID**: [${event.sender}](<https://matrix.to/#/${event.sender}>)`,
				color: 0x0dbd8b,
				fields: [{
					name: "In Channels",
					value: inChannels.map(c => `<#${c.id}>`).join(" • ")
				}, {
					name: "\u200b",
					value: idInfo
				}]
			}],
			flags: DiscordTypes.MessageFlags.Ephemeral
		}
	}
}

/* c8 ignore start */

/** @param {DiscordTypes.APIMessageApplicationCommandGuildInteraction} interaction */
async function interact(interaction) {
	await discord.snow.interaction.createInteractionResponse(interaction.id, interaction.token, await _interact(interaction, {api}))
}

/** @param {DiscordTypes.APIMessageApplicationCommandGuildInteraction} interaction */
async function dm(interaction) {
	const channel = await discord.snow.user.createDirectMessageChannel(interaction.member.user.id)
	const response = await _interact(interaction, {api})
	assert(response.type === DiscordTypes.InteractionResponseType.ChannelMessageWithSource)
	response.data.flags &= 0 // not ephemeral
	await discord.snow.channel.createMessage(channel.id, response.data)
}

module.exports.interact = interact
module.exports._interact = _interact
module.exports.dm = dm
