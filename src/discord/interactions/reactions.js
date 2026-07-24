// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const {discord, sync, select, from} = require("../../passthrough")
const {id: botID} = require("../../../addbot")
const {InteractionMethods} = require("snowtransfer")

/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("../../matrix/utils")} */
const utils = sync.require("../../matrix/utils")

/**
 * @param {DiscordTypes.APIMessageApplicationCommandGuildInteraction} interaction
 * @param {{api: typeof api}} di
 * @returns {AsyncGenerator<{[k in keyof InteractionMethods]?: Parameters<InteractionMethods[k]>[2]}>}
 */
async function* _interact({data}, {api}) {
	const events = from("event_message").join("message_room", "message_id").join("historical_channel_room", "historical_room_index")
		.select("event_id", "room_id").where({message_id: data.target_id}).and("ORDER BY reaction_part").all()
	if (!events.length) {
		return yield {createInteractionResponse: {
			type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: "This message hasn't been bridged to Matrix.",
				flags: DiscordTypes.MessageFlags.Ephemeral
			}
		}}
	}

	yield {createInteractionResponse: {
		type: DiscordTypes.InteractionResponseType.DeferredChannelMessageWithSource,
		data: {
			flags: DiscordTypes.MessageFlags.Ephemeral
		}
	}}

	const reactions = []
	for (const event of events) {
		const reactionsOnEvent = await api.getFullRelations(event.room_id, event.event_id, "m.annotation")
		reactions.push(...reactionsOnEvent)
	}

	/** @type {Map<string, Set<string>>} reaction key (the emoji) -> displaynames */
	const inverted = new Map()
	for (const reaction of reactions) {
		if (utils.eventSenderIsFromDiscord(reaction.sender)) continue
		const key = reaction.content["m.relates_to"].key
		const displayname = select("member_cache", "displayname", {mxid: reaction.sender, room_id: events[0].room_id}).pluck().get() || reaction.sender
		if (!inverted.has(key)) {
			inverted.set(key, new Set())
		}
		// @ts-ignore
		inverted.get(key).add(displayname)
	}

	if (inverted.size === 0) {
		return yield {editOriginalInteractionResponse: {
			content: "Nobody from Matrix reacted to this message.",
		}}
	}

	return yield {editOriginalInteractionResponse: {
		content: [...inverted.entries()].sort((a, b) => b[1].size - a[1].size).map(([key, value]) => `${key} ⮞ ${[...value].join(" ⬩ ")}`).join("\n"),
	}}
}

/* c8 ignore start */

/** @param {DiscordTypes.APIMessageApplicationCommandGuildInteraction} interaction */
async function interact(interaction) {
	for await (const response of _interact(interaction, {api})) {
		if (response.createInteractionResponse) {
			await discord.snow.interaction.createInteractionResponse(interaction.id, interaction.token, response.createInteractionResponse)
		} else if (response.editOriginalInteractionResponse) {
			await discord.snow.interaction.editOriginalInteractionResponse(botID, interaction.token, response.editOriginalInteractionResponse)
		}
	}
}

module.exports.interact = interact
module.exports._interact = _interact
