// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const {discord, sync, from} = require("../../passthrough")

/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")

/**
 * @param {DiscordTypes.APIMessageApplicationCommandGuildInteraction} interaction
 * @param {{api: typeof api}} di
 * @returns {Promise<DiscordTypes.APIInteractionResponse>}
 */
async function _interact({guild_id, data}, {api}) {
	const message = from("event_message").join("message_channel", "message_id").join("channel_room", "channel_id")
		.select("name", "nick", "source", "channel_id", "room_id", "event_id").where({message_id: data.target_id, part: 0}).get()

	if (!message) {
		return {
			type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: "This message hasn't been bridged to Matrix.",
				flags: DiscordTypes.MessageFlags.Ephemeral
			}
		}
	}

	const idInfo = `\n-# Room ID: \`${message.room_id}\`\n-# Event ID: \`${message.event_id}\``
	const roomName = message.nick || message.name

	if (message.source === 1) { // from Discord
		const userID = data.resolved.messages[data.target_id].author.id
		return {
			type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: `Bridged <@${userID}> https://discord.com/channels/${guild_id}/${message.channel_id}/${data.target_id} on Discord to [${roomName}](<https://matrix.to/#/${message.room_id}/${message.event_id}>) on Matrix.`
					+ idInfo,
				flags: DiscordTypes.MessageFlags.Ephemeral
			}
		}
	}

	// from Matrix
	const event = await api.getEvent(message.room_id, message.event_id)
	return {
		type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
		data: {
			content: `Bridged [${event.sender}](<https://matrix.to/#/${event.sender}>)'s message in [${roomName}](<https://matrix.to/#/${message.room_id}/${message.event_id}>) on Matrix to https://discord.com/channels/${guild_id}/${message.channel_id}/${data.target_id} on Discord.`
				+ idInfo,
			flags: DiscordTypes.MessageFlags.Ephemeral
		}
	}
}

/* c8 ignore start */

/** @param {DiscordTypes.APIMessageApplicationCommandGuildInteraction} interaction */
async function interact(interaction) {
	await discord.snow.interaction.createInteractionResponse(interaction.id, interaction.token, await _interact(interaction, {api}))
}

module.exports.interact = interact
module.exports._interact = _interact
