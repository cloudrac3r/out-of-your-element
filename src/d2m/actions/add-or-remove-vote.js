// @ts-check

const assert = require("assert").strict

const passthrough = require("../../passthrough")
const {discord, sync, db, select, from} = passthrough
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("./register-user")} */
const registerUser = sync.require("./register-user")
/** @type {import("./create-room")} */
const createRoom = sync.require("../actions/create-room")

const inFlightPollVotes = new Set()

/**
 * @param {import("discord-api-types/v10").GatewayMessagePollVoteAddDispatch["d"]} data
 */
async function addVote(data){
	const parentID = from("event_message").join("poll_option", "message_id").pluck("event_id").where({message_id: data.message_id, event_type: "org.matrix.msc3381.poll.start"}).get() // Currently Discord doesn't allow sending a poll with anything else, but we bridge it after all other content so reaction_part: 0 is the part that will have the poll.
	if (!parentID) return // Nothing can be done if the parent message was never bridged.

	let realAnswer = select("poll_option", "matrix_option", {message_id: data.message_id, discord_option: data.answer_id.toString()}).pluck().get() // Discord answer IDs don't match those on Matrix-created polls.
	assert(realAnswer)
	db.prepare("INSERT OR IGNORE INTO poll_vote (discord_or_matrix_user_id, message_id, vote) VALUES (?, ?, ?)").run(data.user_id, data.message_id, realAnswer)
	return modifyVote(data, parentID)
}

/**
 * @param {import("discord-api-types/v10").GatewayMessagePollVoteRemoveDispatch["d"]} data
 */
async function removeVote(data){
	const parentID = from("event_message").join("poll_option", "message_id").pluck("event_id").where({message_id: data.message_id, event_type: "org.matrix.msc3381.poll.start"}).get()
	if (!parentID) return

	let realAnswer = select("poll_option", "matrix_option", {message_id: data.message_id, discord_option: data.answer_id.toString()}).pluck().get() // Discord answer IDs don't match those on Matrix-created polls.
	assert(realAnswer)
	db.prepare("DELETE FROM poll_vote WHERE discord_or_matrix_user_id = ? AND message_id = ? AND vote = ?").run(data.user_id, data.message_id, realAnswer)
	return modifyVote(data, parentID)
}

/**
 * @param {import("discord-api-types/v10").GatewayMessagePollVoteAddDispatch["d"]} data
 * @param {string} parentID
 */
async function modifyVote(data, parentID) {

	if (inFlightPollVotes.has(data.user_id+data.message_id)) { // Multiple votes on a poll, and this function has already been called on at least one of them. Need to add these together so we don't ignore votes if someone is voting rapid-fire on a bunch of different polls.
		return;
	}

	inFlightPollVotes.add(data.user_id+data.message_id)

	await new Promise(resolve => setTimeout(resolve, 1000)) // Wait a second.

	const user = await discord.snow.user.getUser(data.user_id) // Gateway event doesn't give us the object, only the ID.

	const roomID = await createRoom.ensureRoom(data.channel_id)
	const senderMxid = await registerUser.ensureSimJoined(user, roomID)

	let answersArray = select("poll_vote", "vote", {discord_or_matrix_user_id: data.user_id, message_id: data.message_id}).pluck().all()

	const eventID = await api.sendEvent(roomID, "org.matrix.msc3381.poll.response", {
		"m.relates_to": {
			rel_type: "m.reference",
			event_id: parentID,
		},
		"org.matrix.msc3381.poll.response": {
			answers: answersArray
		}
	}, senderMxid)

	inFlightPollVotes.delete(data.user_id+data.message_id)

	return eventID

}

module.exports.addVote = addVote
module.exports.removeVote = removeVote
module.exports.modifyVote = modifyVote
