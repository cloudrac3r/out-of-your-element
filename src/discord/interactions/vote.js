// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const {discord, sync, select, from, db} = require("../../passthrough")
const assert = require("assert/strict")
const {id: botID} = require("../../../addbot")
const {InteractionMethods} = require("snowtransfer")

/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("../../matrix/utils")} */
const utils = sync.require("../../matrix/utils")
/** @type {import("../../m2d/converters/poll-components")} */
const pollComponents = sync.require("../../m2d/converters/poll-components")
/** @type {import("../../d2m/actions/add-or-remove-vote")} */
const vote = sync.require("../../d2m/actions/add-or-remove-vote")

/**
 * @param {DiscordTypes.APIMessageComponentButtonInteraction} interaction
 * @param {{api: typeof api}} di
 * @returns {AsyncGenerator<{[k in keyof InteractionMethods]?: Parameters<InteractionMethods[k]>[2]}>}
 */
async function* _interact({data, message, member, user}, {api}) {
	const discordUser = member?.user || user
	assert(discordUser)
	const userID = discordUser.id

	const matrixPollEvent = select("event_message", "event_id", {message_id: message.id}).pluck().get()
	assert(matrixPollEvent)

	const matrixOption = select("poll_option", "matrix_option", {discord_option: data.custom_id, message_id: message.id}).pluck().get()
	assert(matrixOption)

	const pollRow = select("poll", ["question_text", "max_selections"], {message_id: message.id}).get()
	assert(pollRow)
	const maxSelections = pollRow.max_selections
	const alreadySelected = select("poll_vote", "matrix_option", {discord_or_matrix_user_id: userID, message_id: message.id}).pluck().all()

	// Show modal (if no capacity)
	if (maxSelections > 1 && alreadySelected.length === maxSelections) {
		// TODO: show modal
		return
	}

	// We are going to do a server operation so need to show loading state
	yield {createInteractionResponse: {
		type: DiscordTypes.InteractionResponseType.DeferredMessageUpdate,
	}}
	
	// Remove a vote
	if (alreadySelected.includes(data.custom_id)) {
		db.prepare("DELETE FROM poll_vote (discord_or_matrix_user_id, message_id, matrix_option) VALUES (?, ?, ?)").run(userID, message.id, data.custom_id)
	}
	// Replace votes (if only one selection is allowed)
	else if (maxSelections === 1 && alreadySelected.length === 1) {
		db.transaction(() => {
			db.prepare("DELETE FROM poll_vote WHERE message_id = ? AND discord_or_matrix_user_id = ?").run(message.id, userID)
			db.prepare("INSERT OR IGNORE INTO poll_vote (discord_or_matrix_user_id, message_id, matrix_option) VALUES (?, ?, ?)").run(userID, message.id, data.custom_id)
		})()
	}
	// Add a vote (if capacity)
	else if (alreadySelected.length < maxSelections) {
		db.transaction(() => {
			db.prepare("DELETE FROM poll_vote WHERE message_id = ? AND discord_or_matrix_user_id = ?").run(message.id, userID)
			db.prepare("INSERT OR IGNORE INTO poll_vote (discord_or_matrix_user_id, message_id, matrix_option) VALUES (?, ?, ?)").run(userID, message.id, data.custom_id)
		})()
	}

	// Sync changes to Matrix
	await vote.sendVotes(discordUser, message.channel_id, message.id, matrixPollEvent)
	
	// Check the poll is not closed (it may have been closed by sendVotes if we discover we can't send)
	const isClosed = select("poll", "is_closed", {message_id: message.id}).pluck().get()
	
	/** @type {{matrix_option: string, option_text: string, count: number}[]} */
	const pollResults = db.prepare("SELECT matrix_option, option_text, count(*) as count FROM poll_option INNER JOIN poll_vote USING (message_id, matrix_option) GROUP BY matrix_option").all()
	return yield {createInteractionResponse: {
		type: DiscordTypes.InteractionResponseType.UpdateMessage,
		data: pollComponents.getPollComponents(!!isClosed, maxSelections, pollRow.question_text, pollResults)
	}}
}

/* c8 ignore start */

/** @param {DiscordTypes.APIMessageComponentButtonInteraction} interaction */
async function interact(interaction) {
	for await (const response of _interact(interaction, {api})) {
		if (response.createInteractionResponse) {
			await discord.snow.interaction.createInteractionResponse(interaction.id, interaction.token, response.createInteractionResponse)
		}
	}
}

module.exports.interact = interact
module.exports._interact = _interact
