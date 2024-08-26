// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const {discord, sync, db, select, from} = require("../../passthrough")

/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")

/** @param {DiscordTypes.APIContextMenuGuildInteraction} interaction */
async function interact({id, token, data}) {
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

	if (message.source === 1) { // from Discord
		return discord.snow.interaction.createInteractionResponse(id, token, {
			type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: `This message was bridged to [${message.nick || message.name}](<https://matrix.to/#/${message.room_id}/${message.event_id}>) on Matrix.`
					+ `\n-# Room ID: \`${message.room_id}\`\n-# Event ID: \`${message.event_id}\``,
				flags: DiscordTypes.MessageFlags.Ephemeral
			}
		})
	}

	// from Matrix
	const event = await api.getEvent(message.room_id, message.event_id)
	return discord.snow.interaction.createInteractionResponse(id, token, {
		type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
		data: {
			content: `This message was bridged from [${message.nick || message.name}](<https://matrix.to/#/${message.room_id}/${message.event_id}>) on Matrix.`
				+ `\nIt was originally sent by [${event.sender}](<https://matrix.to/#/${event.sender}>).`
				+ `\n-# Room ID: \`${message.room_id}\`\n-# Event ID: \`${message.event_id}\``,
			flags: DiscordTypes.MessageFlags.Ephemeral
		}
	})
}

module.exports.interact = interact
