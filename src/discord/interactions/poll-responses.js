// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const {discord, sync, db, select, from} = require("../../passthrough")
const {id: botID} = require("../../../addbot")
const {InteractionMethods} = require("snowtransfer")

/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("../../m2d/converters/poll-components")} */
const pollComponents = sync.require("../../m2d/converters/poll-components")
const {reg} = require("../../matrix/read-registration")

/**
 * @param {number} percent
 */
function barChart(percent) {
	const width = 12
	const bars = Math.floor(percent*width)
	return "█".repeat(bars) + "▒".repeat(width-bars)
}

/**
 * @param {string} pollMessageID
 * @param {boolean} isClosed
 */
function getCombinedResults(pollMessageID, isClosed) {
	/** @type {{matrix_option: string, option_text: string, count: number}[]} */
	const pollResults = db.prepare("SELECT matrix_option, option_text, seq, count(discord_or_matrix_user_id) as count FROM poll_option LEFT JOIN poll_vote USING (message_id, matrix_option) WHERE message_id = ? GROUP BY matrix_option ORDER BY seq").all(pollMessageID)
	const combinedVotes = pollResults.reduce((a, c) => a + c.count, 0)
	const totalVoters = db.prepare("SELECT count(DISTINCT discord_or_matrix_user_id) as count FROM poll_vote WHERE message_id = ?").pluck().get(pollMessageID)
	const topAnswers = pollResults.toSorted((a, b) => b.count - a.count)

	let messageString = ""
	for (const option of pollResults) {
		const medal = isClosed ? pollComponents.getMedal(topAnswers, option.count) : ""
		const countString = `${String(option.count).padStart(String(topAnswers[0].count).length)}`
		const votesString = option.count === 1 ? "vote " : "votes"
		const label = medal === "🥇" ? `**${option.option_text}**` : option.option_text
		messageString += `\`\u200b${countString} ${votesString}\u200b\` ${barChart(option.count/totalVoters)} ${label} ${medal}\n`
	}

	return {messageString, combinedVotes, totalVoters}
}

/**
 * @param {DiscordTypes.APIMessageApplicationCommandGuildInteraction} interaction
 * @param {{api: typeof api}} di
 * @returns {AsyncGenerator<{[k in keyof InteractionMethods]?: Parameters<InteractionMethods[k]>[2]}>}
 */
async function* _interact({data}, {api}) {
	const row = select("poll", "is_closed", {message_id: data.target_id}).get()

	if (!row) {
		return yield {createInteractionResponse: {
			type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: "This poll hasn't been bridged to Matrix.",
				flags: DiscordTypes.MessageFlags.Ephemeral
			}
		}}
	}

	const {messageString} = getCombinedResults(data.target_id, !!row.is_closed)

	return yield {createInteractionResponse: {
		type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
		data: {
			embeds: [{
				author: {
					name: "Current results including Matrix votes",
					icon_url: `${reg.ooye.bridge_origin}/download/file/poll-star-avatar.png`
				},
				description: messageString
			}],
			flags: DiscordTypes.MessageFlags.Ephemeral
		}
	}}
}

/* c8 ignore start */

/** @param {DiscordTypes.APIMessageApplicationCommandGuildInteraction} interaction */
async function interact(interaction) {
	for await (const response of _interact(interaction, {api})) {
		if (response.createInteractionResponse) {
			await discord.snow.interaction.createInteractionResponse(interaction.id, interaction.token, response.createInteractionResponse)
		}
	}
}

module.exports.interact = interact
module.exports._interact = _interact
module.exports.getCombinedResults = getCombinedResults
