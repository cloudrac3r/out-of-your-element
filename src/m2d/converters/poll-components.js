// @ts-check

const DiscordTypes = require("discord-api-types/v10")

/**
 * @param {boolean} isClosed
 * @param {{matrix_option: string, option_text: string, count: number}[]} pollOptions already sorted correctly
 * @returns {DiscordTypes.APIMessageTopLevelComponent[]}
*/
function optionsToComponents(isClosed, pollOptions) {
	const topAnswers = pollOptions.toSorted((a, b) => b.count - a.count)
	/** @type {DiscordTypes.APIMessageTopLevelComponent[]} */
	return pollOptions.map(option => {
		const winningOrTied = option.count && topAnswers[0].count === option.count
		return {
			type: DiscordTypes.ComponentType.Container,
			components: [{
				type: DiscordTypes.ComponentType.Section,
				components: [{
					type: DiscordTypes.ComponentType.TextDisplay,
					content: option.option_text
				}],
				accessory: {
					type: DiscordTypes.ComponentType.Button,
					style: winningOrTied ? DiscordTypes.ButtonStyle.Success : DiscordTypes.ButtonStyle.Secondary,
					label: option.count.toString(),
					custom_id: option.matrix_option,
					disabled: isClosed
				}
			}]
		}
	})
}

/**
 * @param {boolean} isClosed
 * @param {number} maxSelections
 * @param {string} questionText
 * @param {{matrix_option: string, option_text: string, count: number}[]} pollOptions already sorted correctly
 * @returns {DiscordTypes.RESTPostAPIWebhookWithTokenJSONBody}
 */
function getPollComponents(isClosed, maxSelections, questionText, pollOptions) {
	/** @type {DiscordTypes.APIMessageTopLevelComponent} */
	let headingComponent
	if (isClosed) {
		const multiSelectString =
			( maxSelections === 1 ? "-# ~~Select one answer~~"
			: maxSelections >= pollOptions.length ? "-# ~~Select one or more answers~~"
			: `-# ~~Select up to ${maxSelections} answers~~`)
		headingComponent = { // This one is for the poll heading.
			type: DiscordTypes.ComponentType.Section,
			components: [
				{
					type: DiscordTypes.ComponentType.TextDisplay,
					content: `## ${questionText}`
				},
				{
					type: DiscordTypes.ComponentType.TextDisplay,
					content: multiSelectString
				}
			],
			accessory: {
				type: DiscordTypes.ComponentType.Button,
				style: DiscordTypes.ButtonStyle.Secondary,
				custom_id: "vote",
				label: "Voting closed!",
				disabled: true
			}
		}
	}
	else {
		const multiSelectString =
			( maxSelections === 1 ? "-# Select one answer"
			: maxSelections >= pollOptions.length ? "-# Select one or more answers"
			: `-# Select up to ${maxSelections} answers`)
		headingComponent = { // This one is for the poll heading.
			type: DiscordTypes.ComponentType.Section,
			components: [
				{
					type: DiscordTypes.ComponentType.TextDisplay,
					content: `## ${questionText}`
				},
				{
					type: DiscordTypes.ComponentType.TextDisplay,
					content: multiSelectString
				}
			],
			accessory: {
				type: DiscordTypes.ComponentType.Button,
				style: DiscordTypes.ButtonStyle.Primary,
				custom_id: "vote",
				label: "Vote!"
			}
		}
	}
	const optionComponents = optionsToComponents(isClosed, pollOptions)
	return {
		flags: DiscordTypes.MessageFlags.IsComponentsV2,
		components: [headingComponent, ...optionComponents]
	}
}

module.exports.getPollComponents = getPollComponents