// @ts-check

const assert = require("assert").strict
const DiscordTypes = require("discord-api-types/v10")
const {isDeepStrictEqual} = require("util")

const passthrough = require("../../passthrough")
const {discord, sync, db, select, from} = passthrough
const {reg} = require("../../matrix/read-registration")
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("./register-user")} */
const registerUser = sync.require("./register-user")
/** @type {import("./create-room")} */
const createRoom = sync.require("../actions/create-room")
/** @type {import("./add-or-remove-vote.js")} */
const vote = sync.require("../actions/add-or-remove-vote")
/** @type {import("../../m2d/converters/poll-components")} */
const pollComponents = sync.require("../../m2d/converters/poll-components")
/** @type {import("../../m2d/actions/channel-webhook")} */
const channelWebhook = sync.require("../../m2d/actions/channel-webhook")

// This handles, in the following order:
// * verifying Matrix-side votes are accurate for a poll originating on Discord, sending missed votes to Matrix if necessary
// * sending a message to Discord if a vote in that poll has been cast on Matrix
// This does *not* handle bridging of poll closures on Discord to Matrix; that takes place in converters/message-to-event.js.

/**
 * @param {number} percent
 */
function barChart(percent){
	const width = 12
	const bars = Math.floor(percent*width)
	return "█".repeat(bars) + "▒".repeat(width-bars)
}

/**
 * @param {string} channelID
 * @param {string} messageID
 * @param {string} answerID
 * @returns {Promise<DiscordTypes.RESTGetAPIPollAnswerVotersResult["users"]>}
 */
async function getAllVotesOnAnswer(channelID, messageID, answerID){
	const limit = 100
	/** @type {DiscordTypes.RESTGetAPIPollAnswerVotersResult["users"]} */
	let voteUsers = []
	let after = undefined
	while (!voteUsers.length || after) {
		const curVotes = await discord.snow.channel.getPollAnswerVoters(channelID, messageID, answerID, {after: after, limit})
		if (curVotes.users.length === 0) { // Reached the end.
			break
		}
		if (curVotes.users.length >= limit) { // Loop again for the next page.
			// @ts-ignore - stupid
			after = curVotes.users.at(-1).id
		}
		voteUsers = voteUsers.concat(curVotes.users)
	}
	return voteUsers
}


/**
 * @param {typeof import("../../../test/data.js")["poll_close"]} closeMessage
 * @param {DiscordTypes.APIGuild} guild
*/
async function closePoll(closeMessage, guild){
	const pollCloseObject = closeMessage.embeds[0]

	const pollMessageID = closeMessage.message_reference.message_id
	const pollEventID = select("event_message", "event_id", {message_id: pollMessageID, event_type: "org.matrix.msc3381.poll.start"}).pluck().get()
	if (!pollEventID) return // Nothing we can send Discord-side if we don't have the original poll. We will still send a results message Matrix-side.

	const discordPollOptions = select("poll_option", "discord_option", {message_id: pollMessageID}).pluck().all()
	assert(discordPollOptions.every(x => typeof x === "string")) // This poll originated on Discord so it will have Discord option IDs

	// If the closure came from Discord, we want to fetch all the votes there again and bridge over any that got lost to Matrix before posting the results.
	// Database reads are cheap, and API calls are expensive, so we will only query Discord when the totals don't match.

	const totalVotes = +pollCloseObject.fields.find(element => element.name === "total_votes").value // We could do [2], but best not to rely on the ordering staying consistent.

	const databaseVotes = select("poll_vote", ["discord_or_matrix_user_id", "matrix_option"], {message_id: pollMessageID}, " AND discord_or_matrix_user_id NOT LIKE '@%'").all()

	if (databaseVotes.length !== totalVotes) { // Matching length should be sufficient for most cases.
		let voteUsers = [...new Set(databaseVotes.map(vote => vote.discord_or_matrix_user_id))] // Unique array of all users we have votes for in the database.

		// Main design challenge here: we get the data by *answer*, but we need to send it to Matrix by *user*.

		/** @type {{user: DiscordTypes.APIUser, matrixOptionVotes: string[]}[]} This will be our new array of answers */
		const updatedAnswers = []

		for (const discordPollOption of discordPollOptions) {
			const optionUsers = await getAllVotesOnAnswer(closeMessage.channel_id, pollMessageID, discordPollOption) // Array of user IDs who voted for the option we're testing.
			optionUsers.map(user => {
				const userLocation = updatedAnswers.findIndex(answer => answer.user.id === user.id)
				const matrixOption = select("poll_option", "matrix_option", {message_id: pollMessageID, discord_option: discordPollOption}).pluck().get()
				assert(matrixOption)
				if (userLocation === -1){ // We haven't seen this user yet, so we need to add them.
					updatedAnswers.push({user, matrixOptionVotes: [matrixOption]}) // toString as this is what we store and get from the database and send to Matrix.
				} else { // This user already voted for another option on the poll.
					updatedAnswers[userLocation].matrixOptionVotes.push(matrixOption)
				}
			})
		}

		// Check for inconsistencies in what was cached in database vs final confirmed poll answers
		// If different, sync the final confirmed answers to Matrix-side to make it accurate there too

		await Promise.all(updatedAnswers.map(async answer => {
			voteUsers = voteUsers.filter(item => item !== answer.user.id) // Remove any users we have updated answers for from voteUsers. The only remaining entries in this array will be users who voted, but then removed their votes before the poll ended.
			const cachedAnswers = select("poll_vote", "matrix_option", {discord_or_matrix_user_id: answer.user.id, message_id: pollMessageID}).pluck().all()
			if (!isDeepStrictEqual(new Set(cachedAnswers), new Set(answer.matrixOptionVotes))){
				db.prepare("DELETE FROM poll_vote WHERE discord_or_matrix_user_id = ? AND message_id = ?").run(answer.user.id, pollMessageID) // Delete existing stored votes.
				for (const matrixOption of answer.matrixOptionVotes) {
					db.prepare("INSERT INTO poll_vote (discord_or_matrix_user_id, message_id, matrix_option) VALUES (?, ?, ?)").run(answer.user.id, pollMessageID, matrixOption)
				}
				await vote.debounceSendVotes({user_id: answer.user.id, message_id: pollMessageID, channel_id: closeMessage.channel_id, answer_id: 0}, pollEventID) // Fake answer ID, not actually needed (but we're sorta faking the datatype to call this function).
			}
		}))

		await Promise.all(voteUsers.map(async user_id => { // Remove these votes.
			db.prepare("DELETE FROM poll_vote WHERE discord_or_matrix_user_id = ? AND message_id = ?").run(user_id, pollMessageID)
			await vote.debounceSendVotes({user_id: user_id, message_id: pollMessageID, channel_id: closeMessage.channel_id, answer_id: 0}, pollEventID)
		}))
	}

	/** @type {{matrix_option: string, option_text: string, count: number}[]} */
	const pollResults = db.prepare("SELECT matrix_option, option_text, seq, count(discord_or_matrix_user_id) as count FROM poll_option LEFT JOIN poll_vote USING (message_id, matrix_option) WHERE message_id = ? GROUP BY matrix_option ORDER BY seq").all(pollMessageID)
	const combinedVotes = pollResults.reduce((a, c) => a + c.count, 0)
	const totalVoters = db.prepare("SELECT count(DISTINCT discord_or_matrix_user_id) as count FROM poll_vote WHERE message_id = ?").pluck().get(pollMessageID)

	if (combinedVotes !== totalVotes) { // This means some votes were cast on Matrix!
		// Now that we've corrected the vote totals, we can get the results again and post them to Discord!
		const topAnswers = pollResults.toSorted((a, b) => b.count - a.count)
		let messageString = ""
		for (const option of pollResults) {
			const medal = pollComponents.getMedal(topAnswers, option.count)
			const countString = `${String(option.count).padStart(String(topAnswers[0].count).length)}`
			const votesString = option.count === 1 ? "vote " : "votes"
			const label = medal === "🥇" ? `**${option.option_text}**` : option.option_text
			messageString += `\`\u200b${countString} ${votesString}\u200b\` ${barChart(option.count/totalVoters)} ${label} ${medal}\n`
		}
		return {
			username: "Total results including Matrix votes",
			avatar_url: `${reg.ooye.bridge_origin}/discord/poll-star-avatar.png`,
			content: messageString
		}
	}
}

module.exports.closePoll = closePoll
