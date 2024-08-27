// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const {discord, sync, db, select, from} = require("../../passthrough")

/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")

/** @param {DiscordTypes.APIContextMenuGuildInteraction} interaction */
/** @param {DiscordTypes.APIMessageApplicationCommandGuildInteraction} interaction */
async function interact({id, token, guild_id, channel, data}) {
	const message = from("event_message").join("message_channel", "message_id").join("channel_room", "channel_id")
		.select("name", "nick", "source", "room_id", "event_id").where({message_id: data.target_id}).get()

	if (!message) {
		return discord.snow.interaction.createInteractionResponse(id, token, {
			type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: "This message hasn't been bridged to Matrix.",
				flags: DiscordTypes.MessageFlags.Ephemeral
			}
		})
	}

	const idInfo = `\n-# Room ID: \`${message.room_id}\`\n-# Event ID: \`${message.event_id}\``

	if (message.source === 1) { // from Discord
		const userID = data.resolved.messages[data.target_id].author.id
		return discord.snow.interaction.createInteractionResponse(id, token, {
			type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: `Bridged <@${userID}> https://discord.com/channels/${guild_id}/${channel.id}/${data.target_id} on Discord to [${message.nick || message.name}](<https://matrix.to/#/${message.room_id}/${message.event_id}>) on Matrix.`
					+ idInfo,
				flags: DiscordTypes.MessageFlags.Ephemeral
			}
		})
	}

	// from Matrix
	const event = await api.getEvent(message.room_id, message.event_id)
	return discord.snow.interaction.createInteractionResponse(id, token, {
		type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
		data: {
			content: `Bridged [${event.sender}](<https://matrix.to/#/${event.sender}>)'s message in [${message.nick || message.name}](<https://matrix.to/#/${message.room_id}/${message.event_id}>) on Matrix to https://discord.com/channels/${guild_id}/${channel.id}/${data.target_id} on Discord.`
				+ idInfo,
			flags: DiscordTypes.MessageFlags.Ephemeral
		}
	})
}

module.exports.interact = interact
