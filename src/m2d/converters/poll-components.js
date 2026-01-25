// @ts-check

const assert = require("assert").strict
const DiscordTypes = require("discord-api-types/v10")
const {sync, db, discord, select, from} = require("../../passthrough")

/** @type {import("../actions/setup-emojis")} */
const setupEmojis = sync.require("../actions/setup-emojis")

/**
 * @param {{count: number}[]} topAnswers
 * @param {number} count
 * @returns {string}
 */
function getMedal(topAnswers, count) {
	const winningOrTied = count && topAnswers[0].count === count
	const secondOrTied = !winningOrTied && count && topAnswers[1]?.count === count && topAnswers.slice(-1)[0].count !== count 
	const thirdOrTied = !winningOrTied && !secondOrTied && count && topAnswers[2]?.count === count && topAnswers.slice(-1)[0].count !== count
	const medal =
		( winningOrTied ? "🥇"
		: secondOrTied ? "🥈"
		: thirdOrTied ? "🥉"
		: "")
	return medal
}

/**
 * @param {boolean} isClosed
 * @param {{matrix_option: string, option_text: string, count: number}[]} pollOptions already sorted correctly
 * @returns {DiscordTypes.APIMessageTopLevelComponent[]}
*/
function optionsToComponents(isClosed, pollOptions) {
	const topAnswers = pollOptions.toSorted((a, b) => b.count - a.count)
	/** @type {DiscordTypes.APIMessageTopLevelComponent[]} */
	return pollOptions.map(option => {
		const medal = getMedal(topAnswers, option.count)
		return {
			type: DiscordTypes.ComponentType.Container,
			components: [{
				type: DiscordTypes.ComponentType.Section,
				components: [{
					type: DiscordTypes.ComponentType.TextDisplay,
					content: medal && isClosed ? `${medal} ${option.option_text}` : option.option_text
				}],
				accessory: {
					type: DiscordTypes.ComponentType.Button,
					style: medal === "🥇" && isClosed ? DiscordTypes.ButtonStyle.Success : DiscordTypes.ButtonStyle.Secondary,
					label: option.count.toString(),
					custom_id: `POLL_OPTION#${option.matrix_option}`,
					disabled: isClosed
				}
			}]
		}
	})
}

/**
 * @param {number} maxSelections
 * @param {number} optionCount
 */
function getMultiSelectString(maxSelections, optionCount) {
	if (maxSelections === 1) {
		return "Select one answer"
	} else if (maxSelections >= optionCount) {
		return "Select one or more answers"
	} else {
		return `Select up to ${maxSelections} answers`
	}
}

/**
 * @param {number} maxSelections
 * @param {number} optionCount
 */
function getMultiSelectClosedString(maxSelections, optionCount) {
	if (maxSelections === 1) {
		return "Single choice"
	} else if (maxSelections >= optionCount) {
		return "Multiple choice"
	} else {
		return `Multiple choice (up to ${maxSelections})`
	}
}

/**
 * @param {boolean} isClosed
 * @param {number} maxSelections
 * @param {string} questionText
 * @param {{matrix_option: string, option_text: string, count: number}[]} pollOptions already sorted correctly
 * @returns {DiscordTypes.RESTPostAPIWebhookWithTokenJSONBody}
 */
function getPollComponents(isClosed, maxSelections, questionText, pollOptions) {
	/** @type {DiscordTypes.APIMessageTopLevelComponent[]} array because it can move around */
	const multiSelectInfoComponent =	[{
		type: DiscordTypes.ComponentType.TextDisplay,
		content: isClosed ? `-# ${getMultiSelectClosedString(maxSelections, pollOptions.length)}` : `-# ${getMultiSelectString(maxSelections, pollOptions.length)}`
	}]
	/** @type {DiscordTypes.APIMessageTopLevelComponent} */
	let headingComponent
	if (isClosed) {
		headingComponent = { // This one is for the poll heading.
			type: DiscordTypes.ComponentType.Section,
			components: [
				{
					type: DiscordTypes.ComponentType.TextDisplay,
					content: `## ${questionText}`
				}
			],
			accessory: {
				type: DiscordTypes.ComponentType.Button,
				style: DiscordTypes.ButtonStyle.Secondary,
				custom_id: "POLL_VOTE",
				label: "Voting closed",
				disabled: true
			}
		}
	} else {
		headingComponent = { // This one is for the poll heading.
			type: DiscordTypes.ComponentType.Section,
			components: [
				{
					type: DiscordTypes.ComponentType.TextDisplay,
					content: `## ${questionText}`
				},
				// @ts-ignore
				multiSelectInfoComponent.pop()
			],
			accessory: {
				type: DiscordTypes.ComponentType.Button,
				style: DiscordTypes.ButtonStyle.Primary,
				custom_id: "POLL_VOTE",
				label: "Vote!"
			}
		}
	}
	const optionComponents = optionsToComponents(isClosed, pollOptions)
	return {
		flags: DiscordTypes.MessageFlags.IsComponentsV2,
		components: [headingComponent, ...optionComponents, ...multiSelectInfoComponent]
	}
}

/** @param {string} messageID */
function getPollComponentsFromDatabase(messageID) {
	const pollRow = select("poll", ["max_selections", "is_closed", "question_text"], {message_id: messageID}).get()
	assert(pollRow)
	/** @type {{matrix_option: string, option_text: string, count: number}[]} */
	const pollResults = db.prepare("SELECT matrix_option, option_text, seq, count(discord_or_matrix_user_id) as count FROM poll_option LEFT JOIN poll_vote USING (message_id, matrix_option) WHERE message_id = ? GROUP BY matrix_option ORDER BY seq").all(messageID)
	return getPollComponents(!!pollRow.is_closed, pollRow.max_selections, pollRow.question_text, pollResults)
}

/**
 * @param {string} channelID
 * @param {string} messageID
 * @param {string} questionText
 * @param {{matrix_option: string, option_text: string, count: number}[]} pollOptions already sorted correctly
 * @returns {DiscordTypes.RESTPostAPIWebhookWithTokenJSONBody}
 */
function getPollEndMessage(channelID, messageID, questionText, pollOptions) {
	const topAnswers = pollOptions.toSorted((a, b) => b.count - a.count)
	const totalVotes = pollOptions.reduce((a, c) => a + c.count, 0)
	const tied = topAnswers[0].count === topAnswers[1].count
	const titleString = `-# The poll **${questionText}** has closed.`
	let winnerString = ""
	let resultsString = ""
	if (totalVotes == 0) {
		winnerString = "There was no winner"
	} else if (tied) {
		winnerString = "It's a draw!"
		resultsString = `${Math.round((topAnswers[0].count/totalVotes)*100)}%`
	} else {
		const pollWin = select("auto_emoji", ["name", "emoji_id"], {name: "poll_win"}).get()
		winnerString = `${topAnswers[0].option_text} <:${pollWin?.name}:${pollWin?.emoji_id}>`
		resultsString = `Winning answer • ${Math.round((topAnswers[0].count/totalVotes)*100)}%`
	}
	// @ts-ignore
	const guildID = discord.channels.get(channelID).guild_id
	let mainContent = `**${winnerString}**`
	if (resultsString) {
		mainContent += `\n-# ${resultsString}`
	}
	return {
		flags: DiscordTypes.MessageFlags.IsComponentsV2,
		components: [{
			type: DiscordTypes.ComponentType.TextDisplay,
			content: titleString
		}, {
			type: DiscordTypes.ComponentType.Container,
			components: [{
				type: DiscordTypes.ComponentType.Section,
				components: [{
					type: DiscordTypes.ComponentType.TextDisplay,
					content: `**${winnerString}**\n-# ${resultsString}`
				}],
				accessory: {
					type: DiscordTypes.ComponentType.Button,
					style: DiscordTypes.ButtonStyle.Link,
					url: `https://discord.com/channels/${guildID}/${channelID}/${messageID}`,
					label: "View Poll"
				}
			}]
		}]
	}
}

/**
 * @param {string} channelID
 * @param {string} messageID
 */
async function getPollEndMessageFromDatabase(channelID, messageID) {
	const pollWin = select("auto_emoji", ["name", "emoji_id"], {name: "poll_win"}).get()
	if (!pollWin) {
		await setupEmojis.setupEmojis()
	}

	const pollRow = select("poll", ["max_selections", "question_text"], {message_id: messageID}).get()
	assert(pollRow)
	/** @type {{matrix_option: string, option_text: string, count: number}[]} */
	const pollResults = db.prepare("SELECT matrix_option, option_text, seq, count(discord_or_matrix_user_id) as count FROM poll_option LEFT JOIN poll_vote USING (message_id, matrix_option) WHERE message_id = ? GROUP BY matrix_option ORDER BY seq").all(messageID)
	return getPollEndMessage(channelID, messageID, pollRow.question_text, pollResults)
}

module.exports.getMultiSelectString = getMultiSelectString
module.exports.getPollComponents = getPollComponents
module.exports.getPollComponentsFromDatabase = getPollComponentsFromDatabase
module.exports.getPollEndMessageFromDatabase = getPollEndMessageFromDatabase
module.exports.getMedal = getMedal
