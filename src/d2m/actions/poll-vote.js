// @ts-check

const assert = require("assert").strict
const DiscordTypes = require("discord-api-types/v10")
const {Semaphore} = require("@chriscdn/promise-semaphore")
const {scheduler} = require("timers/promises")

const passthrough = require("../../passthrough")
const {discord, sync, db, select, from} = passthrough
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("./register-user")} */
const registerUser = sync.require("./register-user")
/** @type {import("./create-room")} */
const createRoom = sync.require("../actions/create-room")

const inFlightPollSema = new Semaphore()

/**
 * @param {import("discord-api-types/v10").GatewayMessagePollVoteAddDispatch["d"]} data
 */
async function addVote(data){
	const pollEventID = from("event_message").join("poll_option", "message_id").pluck("event_id").where({message_id: data.message_id, event_type: "org.matrix.msc3381.poll.start"}).get() // Currently Discord doesn't allow sending a poll with anything else, but we bridge it after all other content so reaction_part: 0 is the part that will have the poll.
	if (!pollEventID) return // Nothing can be done if the parent message was never bridged.

	let realAnswer = select("poll_option", "matrix_option", {message_id: data.message_id, discord_option: data.answer_id.toString()}).pluck().get() // Discord answer IDs don't match those on Matrix-created polls.
	assert(realAnswer)
	db.prepare("INSERT OR IGNORE INTO poll_vote (discord_or_matrix_user_id, message_id, matrix_option) VALUES (?, ?, ?)").run(data.user_id, data.message_id, realAnswer)
	return debounceSendVotes(data, pollEventID)
}

/**
 * @param {import("discord-api-types/v10").GatewayMessagePollVoteRemoveDispatch["d"]} data
 */
async function removeVote(data){
	const pollEventID = from("event_message").join("poll_option", "message_id").pluck("event_id").where({message_id: data.message_id, event_type: "org.matrix.msc3381.poll.start"}).get()
	if (!pollEventID) return

	let realAnswer = select("poll_option", "matrix_option", {message_id: data.message_id, discord_option: data.answer_id.toString()}).pluck().get() // Discord answer IDs don't match those on Matrix-created polls.
	assert(realAnswer)
	db.prepare("DELETE FROM poll_vote WHERE discord_or_matrix_user_id = ? AND message_id = ? AND matrix_option = ?").run(data.user_id, data.message_id, realAnswer)
	return debounceSendVotes(data, pollEventID)
}

/**
 * Multiple-choice polls send all the votes at the same time. This debounces and sends the combined votes.
 * In the meantime, the combined votes are assembled in the `poll_vote` database table by the above functions.
 * @param {import("discord-api-types/v10").GatewayMessagePollVoteAddDispatch["d"]} data
 * @param {string} pollEventID
 * @return {Promise<string>} event ID of Matrix vote
 */
async function debounceSendVotes(data, pollEventID) {
	return await inFlightPollSema.request(async () => {
		await scheduler.wait(1000) // Wait for votes to be collected

		const user = await discord.snow.user.getUser(data.user_id) // Gateway event doesn't give us the object, only the ID.
		return await sendVotes(user, data.channel_id, data.message_id, pollEventID)
	}, `${data.user_id}/${data.message_id}`)
}

/**
 * @param {DiscordTypes.APIUser} user
 * @param {string} channelID
 * @param {string} pollMessageID
 * @param {string} pollEventID
 */
async function sendVotes(user, channelID, pollMessageID, pollEventID) {
	const latestRoomID = select("channel_room", "room_id", {channel_id: channelID}).pluck().get()
	const matchingRoomID = from("message_room").join("historical_channel_room", "historical_room_index").where({message_id: pollMessageID}).pluck("room_id").get()
	if (!latestRoomID || latestRoomID !== matchingRoomID) { // room upgrade mid-poll??
		db.prepare("UPDATE poll SET is_closed = 1 WHERE message_id = ?").run(pollMessageID)
		return
	}

	const senderMxid = await registerUser.ensureSimJoined(user, matchingRoomID)

	const answersArray = select("poll_vote", "matrix_option", {discord_or_matrix_user_id: user.id, message_id: pollMessageID}).pluck().all()
	const eventID = await api.sendEvent(matchingRoomID, "org.matrix.msc3381.poll.response", {
		"m.relates_to": {
			rel_type: "m.reference",
			event_id: pollEventID,
		},
		"org.matrix.msc3381.poll.response": {
			answers: answersArray
		}
	}, senderMxid)

	return eventID
}

module.exports.addVote = addVote
module.exports.removeVote = removeVote
module.exports.debounceSendVotes = debounceSendVotes
module.exports.sendVotes = sendVotes