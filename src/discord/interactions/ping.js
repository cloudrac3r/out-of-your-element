// @ts-check

const assert = require("assert").strict
const Ty = require("../../types")
const DiscordTypes = require("discord-api-types/v10")
const {discord, sync, select, from} = require("../../passthrough")
const {id: botID} = require("../../../addbot")
const {InteractionMethods} = require("snowtransfer")

/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("../../matrix/utils")} */
const utils = sync.require("../../matrix/utils")
/** @type {import("../../web/routes/guild")} */
const webGuild = sync.require("../../web/routes/guild")

/**
 * @param {DiscordTypes.APIApplicationCommandAutocompleteGuildInteraction} interaction
 * @param {{api: typeof api}} di
 * @returns {AsyncGenerator<{[k in keyof InteractionMethods]?: Parameters<InteractionMethods[k]>[2]}>}
 */
async function* _interactAutocomplete({data, channel}, {api}) {
	function exit() {
		return {createInteractionResponse: {
			/** @type {DiscordTypes.InteractionResponseType.ApplicationCommandAutocompleteResult} */
			type: DiscordTypes.InteractionResponseType.ApplicationCommandAutocompleteResult,
			data: {
				choices: []
			}
		}}
	}

	// Check it was used in a bridged channel
	const roomID = select("channel_room", "room_id", {channel_id: channel.id}).pluck().get()
	if (!roomID) return yield exit()

	// Check we are in fact autocompleting the first option, the user
	if (!data.options?.[0] || data.options[0].type !== DiscordTypes.ApplicationCommandOptionType.String || !data.options[0].focused) {
		return yield exit()
	}

	/** @type {{displayname: string | null, mxid: string}[][]} */
	const providedMatches = []

	const input = data.options[0].value
	if (input === "") {
		const events = await api.getEvents(roomID, "b", {limit: 40})
		const recents = new Set(events.chunk.map(e => e.sender))
		const matches = select("member_cache", ["mxid", "displayname"], {room_id: roomID}, "AND displayname IS NOT NULL LIMIT 25").all()
		matches.sort((a, b) => +recents.has(b.mxid) - +recents.has(a.mxid))
		providedMatches.push(matches)
	} else if (input.startsWith("@")) { // only autocomplete mxids
		const query = input.replaceAll(/[%_$]/g, char => `$${char}`) + "%"
		const matches = select("member_cache", ["mxid", "displayname"], {room_id: roomID}, "AND mxid LIKE ? ESCAPE '$' LIMIT 25").all(query)
		providedMatches.push(matches)
	} else {
		const query = "%" + input.replaceAll(/[%_$]/g, char => `$${char}`) + "%"
		const displaynameMatches = select("member_cache", ["mxid", "displayname"], {room_id: roomID}, "AND displayname IS NOT NULL AND displayname LIKE ? ESCAPE '$' LIMIT 25").all(query)
		// prioritise matches closer to the start
		displaynameMatches.sort((a, b) => {
			let ai = a.displayname.toLowerCase().indexOf(input.toLowerCase())
			if (ai === -1) ai = 999
			let bi = b.displayname.toLowerCase().indexOf(input.toLowerCase())
			if (bi === -1) bi = 999
			return ai - bi
		})
		providedMatches.push(displaynameMatches)
		let mxidMatches = select("member_cache", ["mxid", "displayname"], {room_id: roomID}, "AND displayname IS NOT NULL AND mxid LIKE ? ESCAPE '$' LIMIT 25").all(query)
		mxidMatches = mxidMatches.filter(match => {
			// don't include matches in domain part of mxid
			if (!match.mxid.match(/^[^:]*/)?.includes(query)) return false
			if (displaynameMatches.some(m => m.mxid === match.mxid)) return false
			return true
		})
		providedMatches.push(mxidMatches)
	}

	// merge together
	let matches = providedMatches.flat()

	// don't include bot
	matches = matches.filter(m => m.mxid !== utils.bot)

	// remove duplicates and count up to 25
	const limitedMatches = []
	const seen = new Set()
	for (const match of matches) {
		if (limitedMatches.length >= 25) break
		if (seen.has(match.mxid)) continue
		limitedMatches.push(match)
		seen.add(match.mxid)
	}

	yield {createInteractionResponse: {
		type: DiscordTypes.InteractionResponseType.ApplicationCommandAutocompleteResult,
		data: {
			choices: limitedMatches.map(row => ({name: (row.displayname || row.mxid).slice(0, 100), value: row.mxid.slice(0, 100)}))
		}
	}}
}

/**
 * @param {DiscordTypes.APIChatInputApplicationCommandGuildInteraction & {channel: DiscordTypes.APIGuildTextChannel}} interaction
 * @param {{api: typeof api}} di
 * @returns {AsyncGenerator<{[k in keyof InteractionMethods]?: Parameters<InteractionMethods[k]>[2]}>}
 */
async function* _interactCommand({data, channel, guild_id}, {api}) {
	const roomID = select("channel_room", "room_id", {channel_id: channel.id}).pluck().get()
	if (!roomID) {
		return yield {createInteractionResponse: {
			type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
			data: {
				flags: DiscordTypes.MessageFlags.Ephemeral,
				content: "This channel isn't bridged to Matrix."
			}
		}}
	}

	assert(data.options?.[0]?.type === DiscordTypes.ApplicationCommandOptionType.String)
	const mxid = data.options[0].value
	if (!mxid.match(/^@[^:]*:./)) {
		return yield {createInteractionResponse: {
			type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
			data: {
				flags: DiscordTypes.MessageFlags.Ephemeral,
				content: "⚠️ To use `/ping`, you must select an option from autocomplete, or type a full Matrix ID.\n> Tip: This command is not necessary. You can also ping Matrix users just by typing @their name in your message. It won't look like anything, but it does go through."
			}
		}}
	}

	yield {createInteractionResponse: {
		type: DiscordTypes.InteractionResponseType.DeferredChannelMessageWithSource
	}}

	try {
		/** @type {Ty.Event.M_Room_Member} */
		var member = await api.getStateEvent(roomID, "m.room.member", mxid)
	} catch (e) {}

	if (!member || member.membership !== "join") {
		const inChannels = discord.guildChannelMap.get(guild_id)
			.map(cid => discord.channels.get(cid))
			.sort((a, b) => webGuild._getPosition(a, discord.channels) - webGuild._getPosition(b, discord.channels))
			.filter(channel => from("channel_room").join("member_cache", "room_id").select("mxid").where({channel_id: channel.id, mxid}).get())
		if (inChannels.length) {
			return yield {editOriginalInteractionResponse: {
				content: `That person isn't in this channel. They have only joined the following channels:\n${inChannels.map(c => `<#${c.id}>`).join(" • ")}\nYou can ask them to join this channel with \`/invite\`.`,
			}}
		} else {
			return yield {editOriginalInteractionResponse: {
				content: "That person isn't in this channel. You can invite them with `/invite`."
			}}
		}
	}

	yield {editOriginalInteractionResponse: {
		content: "@" + (member.displayname || mxid)
	}}

	yield {createFollowupMessage: {
		flags: DiscordTypes.MessageFlags.Ephemeral | DiscordTypes.MessageFlags.IsComponentsV2,
		components: [{
			type: DiscordTypes.ComponentType.Container,
			components: [{
				type: DiscordTypes.ComponentType.TextDisplay,
				content: "Tip: This command is not necessary. You can also ping Matrix users just by typing @their name in your message. It won't look like anything, but it does go through."
			}]
		}]
	}}
}

/* c8 ignore start */

/** @param {(DiscordTypes.APIChatInputApplicationCommandGuildInteraction & {channel: DiscordTypes.APIGuildTextChannel}) | DiscordTypes.APIApplicationCommandAutocompleteGuildInteraction} interaction */
async function interact(interaction) {
	if (interaction.type === DiscordTypes.InteractionType.ApplicationCommandAutocomplete) {
		for await (const response of _interactAutocomplete(interaction, {api})) {
			if (response.createInteractionResponse) {
				await discord.snow.interaction.createInteractionResponse(interaction.id, interaction.token, response.createInteractionResponse)
			}
		}
	} else {
		for await (const response of _interactCommand(interaction, {api})) {
			if (response.createInteractionResponse) {
				await discord.snow.interaction.createInteractionResponse(interaction.id, interaction.token, response.createInteractionResponse)
			} else if (response.editOriginalInteractionResponse) {
				await discord.snow.interaction.editOriginalInteractionResponse(botID, interaction.token, response.editOriginalInteractionResponse)
			} else if (response.createFollowupMessage) {
				await discord.snow.interaction.createFollowupMessage(botID, interaction.token, response.createFollowupMessage)
			}
		}
	}
}

module.exports.interact = interact
