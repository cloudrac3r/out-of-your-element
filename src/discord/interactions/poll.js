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
	if (!member?.user) return
	const userID = member.user.id

	const pollRow = select("poll", ["question_text", "max_selections"], {message_id: message.id}).get()
	if (!pollRow) return

	// Definitely supposed to be a poll button click. We can use assertions now.

	const matrixPollEvent = select("event_message", "event_id", {message_id: message.id}).pluck().get()
	assert(matrixPollEvent)

	const maxSelections = pollRow.max_selections
	const alreadySelected = select("poll_vote", "matrix_option", {discord_or_matrix_user_id: userID, message_id: message.id}).pluck().all()
	
	// Show modal (if no capacity or if requested)
	if (data.custom_id === "POLL_VOTE" || (maxSelections > 1 && alreadySelected.length === maxSelections)) {
		const options = select("poll_option", ["matrix_option", "option_text", "seq"], {message_id: message.id}, "ORDER BY seq").all().map(option => ({
			value: option.matrix_option,
			label: option.option_text,
			default: alreadySelected.includes(option.matrix_option)
		}))
		const checkboxGroupExtras = maxSelections === 1 && options.length > 1 ? {} : {
			type: 22, // DiscordTypes.ComponentType.CheckboxGroup
			min_values: 0,
			max_values: maxSelections
		}
		return yield {createInteractionResponse: {
			type: DiscordTypes.InteractionResponseType.Modal,
			data: {
				custom_id: "POLL_MODAL",
				title: "Poll",
				components: [{
					type: DiscordTypes.ComponentType.TextDisplay,
					content: `-# ${pollComponents.getMultiSelectString(pollRow.max_selections, options.length)}`
				}, {
					type: DiscordTypes.ComponentType.Label,
					label: pollRow.question_text,
					component: /* {
						type: 21, // DiscordTypes.ComponentType.RadioGroup
						custom_id: "POLL_MODAL_SELECTION",
						options,
						required: false,
						...checkboxGroupExtras
					} */
					{
						type: DiscordTypes.ComponentType.StringSelect,
						custom_id: "POLL_MODAL_SELECTION",
						options,
						required: false,
						min_values: 0,
						max_values: maxSelections,
					}
				}]
			}
		}}
	}

	if (data.custom_id === "POLL_MODAL") {
		// Clicked options via modal
		/** @type {DiscordTypes.APIMessageStringSelectInteractionData} */ // @ts-ignore - close enough to the real thing
		const component = data.components[1].component
		assert.equal(component.custom_id, "POLL_MODAL_SELECTION")

		// Replace votes with selection
		db.transaction(() => {
			db.prepare("DELETE FROM poll_vote WHERE message_id = ? AND discord_or_matrix_user_id = ?").run(message.id, userID)
			for (const option of component.values) {
				db.prepare("INSERT OR IGNORE INTO poll_vote (discord_or_matrix_user_id, message_id, matrix_option) VALUES (?, ?, ?)").run(userID, message.id, option)
			}
		})()
		
		// Update counts on message
		yield {createInteractionResponse: {
			type: DiscordTypes.InteractionResponseType.UpdateMessage,
			data: pollComponents.getPollComponentsFromDatabase(message.id)
		}}

		// Sync changes to Matrix
		await vote.sendVotes(member.user, message.channel_id, message.id, matrixPollEvent)
	} else {
		// Clicked buttons on message
		const optionPrefix = "POLL_OPTION#" // we use a prefix to prevent someone from sending a Matrix poll that intentionally collides with other elements of the embed
		const matrixOption = select("poll_option", "matrix_option", {matrix_option: data.custom_id.substring(optionPrefix.length), message_id: message.id}).pluck().get()
		assert(matrixOption)
		
		// Remove a vote
		if (alreadySelected.includes(matrixOption)) {
			db.prepare("DELETE FROM poll_vote WHERE discord_or_matrix_user_id = ? AND message_id = ? AND matrix_option = ?").run(userID, message.id, matrixOption)
		}
		// Replace votes (if only one selection is allowed)
		else if (maxSelections === 1 && alreadySelected.length === 1) {
			db.transaction(() => {
				db.prepare("DELETE FROM poll_vote WHERE message_id = ? AND discord_or_matrix_user_id = ?").run(message.id, userID)
				db.prepare("INSERT OR IGNORE INTO poll_vote (discord_or_matrix_user_id, message_id, matrix_option) VALUES (?, ?, ?)").run(userID, message.id, matrixOption)
			})()
		}
		// Add a vote (if capacity)
		else if (alreadySelected.length < maxSelections) {
			db.prepare("INSERT OR IGNORE INTO poll_vote (discord_or_matrix_user_id, message_id, matrix_option) VALUES (?, ?, ?)").run(userID, message.id, matrixOption)
		}

		// Update counts on message
		yield {createInteractionResponse: {
			type: DiscordTypes.InteractionResponseType.UpdateMessage,
			data: pollComponents.getPollComponentsFromDatabase(message.id)
		}}

		// Sync changes to Matrix
		await vote.sendVotes(member.user, message.channel_id, message.id, matrixPollEvent)
	}
}

/* c8 ignore start */

/** @param {DiscordTypes.APIMessageComponentButtonInteraction} interaction */
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
