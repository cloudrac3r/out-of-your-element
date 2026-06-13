// @ts-check

const Ty = require("../../types")
const assert = require("assert").strict
const passthrough = require("../../passthrough")
const {sync, db, select} = passthrough

/** @type {import("../../discord/utils")} */
const dUtils = sync.require("../../discord/utils")
/** @type {import("../converters/poll-components")} */
const pollComponents = sync.require("../converters/poll-components")
/** @type {import("./channel-webhook")} */
const webhook = sync.require("./channel-webhook")

/** @param {Ty.Event.Outer_Org_Matrix_Msc3381_Poll_Response} event */
async function updateVote(event) {
	const messageRow = select("event_message", ["message_id", "source"], {event_id: event.content["m.relates_to"].event_id, event_type: "org.matrix.msc3381.poll.start"}).get()
	const messageID = messageRow?.message_id
	if (!messageID) return // Nothing can be done if the parent message was never bridged.

	db.transaction(() => {
		db.prepare("DELETE FROM poll_vote WHERE discord_or_matrix_user_id = ? AND message_id = ?").run(event.sender, messageID) // Clear all the existing votes, since this overwrites.
		for (const answer of event.content["org.matrix.msc3381.poll.response"].answers) {
			db.prepare("INSERT OR IGNORE INTO poll_vote (discord_or_matrix_user_id, message_id, matrix_option) VALUES (?, ?, ?)").run(event.sender, messageID, answer)
		}
	})()

	// If poll was started on Matrix, the Discord version is using components, so we can update that to the current status
	if (messageRow.source === 0) {
		const row = select("channel_room", ["channel_id", "thread_parent"], {room_id: event.room_id}).get()
		assert(row)
		const {channelID, threadID} = dUtils.swapThreadID(row.channel_id, row.thread_parent)
		await webhook.editMessageWithWebhook(channelID, messageID, pollComponents.getPollComponentsFromDatabase(messageID), threadID)
	}
}

module.exports.updateVote = updateVote
