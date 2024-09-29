// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const {discord, sync, db, select, from} = require("../../passthrough")

/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("../../m2d/converters/utils")} */
const utils = sync.require("../../m2d/converters/utils")

/**
 * @param {DiscordTypes.APIMessageApplicationCommandGuildInteraction} interaction
 * @param {{api: typeof api}} di
 * @returns {Promise<DiscordTypes.APIInteractionResponse>}
 */
async function _interact({data}, {api}) {
	const row = from("event_message").join("message_channel", "message_id").join("channel_room", "channel_id")
		.select("event_id", "room_id").where({message_id: data.target_id}).get()
	if (!row) {
		return {
			type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: "This message hasn't been bridged to Matrix.",
				flags: DiscordTypes.MessageFlags.Ephemeral
			}
		}
	}

	const reactions = await api.getFullRelations(row.room_id, row.event_id, "m.annotation")

	/** @type {Map<string, string[]>} */
	const inverted = new Map()
	for (const reaction of reactions) {
		if (utils.eventSenderIsFromDiscord(reaction.sender)) continue
		const key = reaction.content["m.relates_to"].key
		const displayname = select("member_cache", "displayname", {mxid: reaction.sender, room_id: row.room_id}).pluck().get() || reaction.sender
		if (!inverted.has(key)) inverted.set(key, [])
		// @ts-ignore
		inverted.get(key).push(displayname)
	}

	if (inverted.size === 0) {
		return {
			type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: "Nobody from Matrix reacted to this message.",
				flags: DiscordTypes.MessageFlags.Ephemeral
			}
		}
	}

	return {
		type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
		data: {
			content: [...inverted.entries()].map(([key, value]) => `${key} ⮞ ${value.join(" ⬩ ")}`).join("\n"),
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
