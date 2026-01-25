// @ts-check

const Ty = require("../../types")
const DiscordTypes = require("discord-api-types/v10")
const {Readable} = require("stream")
const assert = require("assert").strict
const crypto = require("crypto")
const passthrough = require("../../passthrough")
const {sync, discord, db, select} = passthrough

/** @param {Ty.Event.Outer_Org_Matrix_Msc3381_Poll_Response} event */
async function updateVote(event) {

	const messageID = select("event_message", "message_id", {event_id: event.content["m.relates_to"].event_id, event_type: "org.matrix.msc3381.poll.start"}).pluck().get()
	if (!messageID) return // Nothing can be done if the parent message was never bridged.

	db.prepare("DELETE FROM poll_vote WHERE discord_or_matrix_user_id = ? AND message_id = ?").run(event.sender, messageID) // Clear all the existing votes, since this overwrites. Technically we could check and only overwrite the changes, but the complexity isn't worth it.

	event.content["org.matrix.msc3381.poll.response"].answers.map(answer=>{
		db.prepare("INSERT OR IGNORE INTO poll_vote (discord_or_matrix_user_id, message_id, vote) VALUES (?, ?, ?)").run(event.sender, messageID, answer)
	})
}

module.exports.updateVote = updateVote
