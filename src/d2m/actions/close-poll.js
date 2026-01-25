// @ts-check

const assert = require("assert").strict
const DiscordTypes = require("discord-api-types/v10")
const {isDeepStrictEqual} = require("util")

const passthrough = require("../../passthrough")
const {discord, sync, db, select, from} = passthrough
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("./register-user")} */
const registerUser = sync.require("./register-user")
/** @type {import("./create-room")} */
const createRoom = sync.require("../actions/create-room")
/** @type {import("./add-or-remove-vote.js")} */
const vote = sync.require("../actions/add-or-remove-vote")
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
	let bars = Math.floor(percent*10)
	return "█".repeat(bars) + "▒".repeat(10-bars)
}

async function getAllVotes(channel_id, message_id, answer_id){
	let voteUsers = []
	let after = 0;
	while (!voteUsers.length || after){
		let curVotes = await discord.snow.requestHandler.request("/channels/"+channel_id+"/polls/"+message_id+"/answers/"+answer_id, {after: after, limit: 100}, "get", "json")
		if (curVotes.users.length == 0 && after == 0){ // Zero votes.
			break
		}
		if (curVotes.users[99]){
			after = curVotes.users[99].id
		}
		voteUsers = voteUsers.concat(curVotes.users)
	}
	return voteUsers
}


/**
 * @param {typeof import("../../../test/data.js")["poll_close"]} message
 * @param {DiscordTypes.APIGuild} guild
*/
async function closePoll(message, guild){
	const pollCloseObject = message.embeds[0]

	const parentID = select("event_message", "event_id", {message_id: message.message_reference.message_id, event_type: "org.matrix.msc3381.poll.start"}).pluck().get()
	if (!parentID) return // Nothing we can send Discord-side if we don't have the original poll. We will still send a results message Matrix-side.

	const pollOptions = select("poll_option", "discord_option", {message_id: message.message_reference.message_id}).pluck().all()
	// If the closure came from Discord, we want to fetch all the votes there again and bridge over any that got lost to Matrix before posting the results.
	// Database reads are cheap, and API calls are expensive, so we will only query Discord when the totals don't match.

	let totalVotes = pollCloseObject.fields.find(element => element.name === "total_votes").value // We could do [2], but best not to rely on the ordering staying consistent.

	let databaseVotes = select("poll_vote", ["discord_or_matrix_user_id", "vote"], {message_id: message.message_reference.message_id}, " AND discord_or_matrix_user_id NOT LIKE '@%'").all()

	if (databaseVotes.length != totalVotes) { // Matching length should be sufficient for most cases.
		let voteUsers = [...new Set(databaseVotes.map(vote => vote.discord_or_matrix_user_id))] // Unique array of all users we have votes for in the database.

		// Main design challenge here: we get the data by *answer*, but we need to send it to Matrix by *user*.

		let updatedAnswers = [] // This will be our new array of answers: [{user: ID, votes: [1, 2, 3]}].
		for (let i=0;i<pollOptions.length;i++){
			let optionUsers = await getAllVotes(message.channel_id, message.message_reference.message_id, pollOptions[i]) // Array of user IDs who voted for the option we're testing.
			optionUsers.map(user=>{
				let userLocation = updatedAnswers.findIndex(item=>item.id===user.id)
				if (userLocation === -1){ // We haven't seen this user yet, so we need to add them.
					updatedAnswers.push({id: user.id, votes: [pollOptions[i].toString()]}) // toString as this is what we store and get from the database and send to Matrix.
				} else { // This user already voted for another option on the poll.
					updatedAnswers[userLocation].votes.push(pollOptions[i])
				}
			})
		}
		updatedAnswers.map(async user=>{
			voteUsers = voteUsers.filter(item => item != user.id) // Remove any users we have updated answers for from voteUsers. The only remaining entries in this array will be users who voted, but then removed their votes before the poll ended.
			let userAnswers = select("poll_vote", "vote", {discord_or_matrix_user_id: user.id, message_id: message.message_reference.message_id}).pluck().all().sort()
			let updatedUserAnswers = user.votes.sort() // Sorting both just in case.
			if (isDeepStrictEqual(userAnswers,updatedUserAnswers)){
				db.prepare("DELETE FROM poll_vote WHERE discord_or_matrix_user_id = ? AND message_id = ?").run(user.id, message.message_reference.message_id) // Delete existing stored votes.
				updatedUserAnswers.map(vote=>{
					db.prepare("INSERT INTO poll_vote (discord_or_matrix_user_id, message_id, vote) VALUES (?, ?, ?)").run(user.id, message.message_reference.message_id, vote)
				})
				await vote.modifyVote({user_id: user.id, message_id: message.message_reference.message_id, channel_id: message.channel_id, answer_id: 0}, parentID) // Fake answer ID, not actually needed (but we're sorta faking the datatype to call this function).
			}
		})

		voteUsers.map(async user_id=>{ // Remove these votes.
			db.prepare("DELETE FROM poll_vote WHERE discord_or_matrix_user_id = ? AND message_id = ?").run(user_id, message.message_reference.message_id)
			await vote.modifyVote({user_id: user_id, message_id: message.message_reference.message_id, channel_id: message.channel_id, answer_id: 0}, parentID)
		})
	}

	let combinedVotes = 0;

	let pollResults = pollOptions.map(option => {
		let votes = Number(db.prepare("SELECT COUNT(*) FROM poll_vote WHERE message_id = ? AND vote = ?").get(message.message_reference.message_id, option)["COUNT(*)"])
		combinedVotes = combinedVotes + votes
		return {answer: option, votes: votes}
	})

	if (combinedVotes!=totalVotes){ // This means some votes were cast on Matrix!
		let pollAnswersObject = (await discord.snow.channel.getChannelMessage(message.channel_id, message.message_reference.message_id)).poll.answers
		// Now that we've corrected the vote totals, we can get the results again and post them to Discord!
		let winningAnswer = 0
		let unique = true
		for (let i=1;i<pollResults.length;i++){
			if (pollResults[i].votes>pollResults[winningAnswer].votes){
				winningAnswer = i
				unique = true
			} else if (pollResults[i].votes==pollResults[winningAnswer].votes){
				unique = false
			}
		}

		let messageString = "📶 Results with Matrix votes\n"
		for (let i=0;i<pollResults.length;i++){
			if (i == winningAnswer && unique){
				messageString = messageString + barChart(pollResults[i].votes/combinedVotes) + " **" + pollAnswersObject[i].poll_media.text + "** (**" + pollResults[i].votes + "**)\n"
			} else{
				messageString = messageString + barChart(pollResults[i].votes/combinedVotes) + " " + pollAnswersObject[i].poll_media.text + " (" + pollResults[i].votes + ")\n"
			}
		}
		const messageResponse = await channelWebhook.sendMessageWithWebhook(message.channel_id, {content: messageString}, message.thread_id)
		db.prepare("INSERT INTO message_channel (message_id, channel_id) VALUES (?, ?)").run(messageResponse.id, message.thread_id || message.channel_id)
	}
}

module.exports.closePoll = closePoll
