// @ts-check

const assert = require("assert").strict
const DiscordTypes = require("discord-api-types/v10")
const {isDeepStrictEqual} = require("util")

const passthrough = require("../../passthrough")
const {discord, sync, db, select, from} = passthrough
const {reg} = require("../../matrix/read-registration")
/** @type {import("./poll-vote")} */
const vote = sync.require("../actions/poll-vote")
/** @type {import("../../discord/interactions/poll-responses")} */
const pollResponses = sync.require("../../discord/interactions/poll-responses")

/**
 * @file This handles, in the following order:
 * * verifying Matrix-side votes are accurate for a poll originating on Discord, sending missed votes to Matrix if necessary
 * * sending a message to Discord if a vote in that poll has been cast on Matrix
 * This does *not* handle bridging of poll closures on Discord to Matrix; that takes place in converters/message-to-event.js.
 */

/**
 * @param {string} channelID
 * @param {string} messageID
 * @param {string} answerID
 * @returns {Promise<DiscordTypes.RESTGetAPIPollAnswerVotersResult["users"]>}
 */
async function getAllVotesOnAnswer(channelID, messageID, answerID) {
	const limit = 100
	/** @type {DiscordTypes.RESTGetAPIPollAnswerVotersResult["users"]} */
	let voteUsers = []
	let after = undefined
	while (true) {
		const curVotes = await discord.snow.channel.getPollAnswerVoters(channelID, messageID, answerID, {after: after, limit})
		voteUsers = voteUsers.concat(curVotes.users)
		if (curVotes.users.length >= limit) { // Loop again for the next page.
			// @ts-ignore - stupid
			after = curVotes.users.at(-1).id
		} else { // Reached the end.
			return voteUsers
		}
	}
}

/**
 * @param {typeof import("../../../test/data.js")["poll_close"]} closeMessage
*/
async function endPoll(closeMessage) {
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
			for (const user of optionUsers) {
				const userLocation = updatedAnswers.findIndex(answer => answer.user.id === user.id)
				const matrixOption = select("poll_option", "matrix_option", {message_id: pollMessageID, discord_option: discordPollOption}).pluck().get()
				assert(matrixOption)
				if (userLocation === -1) { // We haven't seen this user yet, so we need to add them.
					updatedAnswers.push({user, matrixOptionVotes: [matrixOption]}) // toString as this is what we store and get from the database and send to Matrix.
				} else { // This user already voted for another option on the poll.
					updatedAnswers[userLocation].matrixOptionVotes.push(matrixOption)
				}
			}
		}

		// Check for inconsistencies in what was cached in database vs final confirmed poll answers
		// If different, sync the final confirmed answers to Matrix-side to make it accurate there too

		await Promise.all(updatedAnswers.map(async answer => {
			voteUsers = voteUsers.filter(item => item !== answer.user.id) // Remove any users we have updated answers for from voteUsers. The only remaining entries in this array will be users who voted, but then removed their votes before the poll ended.
			const cachedAnswers = select("poll_vote", "matrix_option", {discord_or_matrix_user_id: answer.user.id, message_id: pollMessageID}).pluck().all()
			if (!isDeepStrictEqual(new Set(cachedAnswers), new Set(answer.matrixOptionVotes))) {
				db.transaction(() => {
					db.prepare("DELETE FROM poll_vote WHERE discord_or_matrix_user_id = ? AND message_id = ?").run(answer.user.id, pollMessageID) // Delete existing stored votes.
					for (const matrixOption of answer.matrixOptionVotes) {
						db.prepare("INSERT INTO poll_vote (discord_or_matrix_user_id, message_id, matrix_option) VALUES (?, ?, ?)").run(answer.user.id, pollMessageID, matrixOption)
					}
				})()
				await vote.sendVotes(answer.user, closeMessage.channel_id, pollMessageID, pollEventID)
			}
		}))

		await Promise.all(voteUsers.map(async user_id => { // Remove these votes.
			db.prepare("DELETE FROM poll_vote WHERE discord_or_matrix_user_id = ? AND message_id = ?").run(user_id, pollMessageID)
			await vote.sendVotes(user_id, closeMessage.channel_id, pollMessageID, pollEventID)
		}))
	}

	const {combinedVotes, messageString} = pollResponses.getCombinedResults(pollMessageID, true)

	if (combinedVotes !== totalVotes) { // This means some votes were cast on Matrix. Now that we've corrected the vote totals, we can get the results again and post them to Discord.
		return {
			username: "Total results including Matrix votes",
			avatar_url: `${reg.ooye.bridge_origin}/download/file/poll-star-avatar.png`,
			content: messageString,
			flags: DiscordTypes.MessageFlags.SuppressEmbeds
		}
	}
}

module.exports.endPoll = endPoll
