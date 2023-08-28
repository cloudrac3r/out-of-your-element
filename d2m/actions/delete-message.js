// @ts-check

const passthrough = require("../../passthrough")
const { sync, db } = passthrough
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")

/**
 * @param {import("discord-api-types/v10").GatewayMessageDeleteDispatchData} data
 */
async function deleteMessage(data) {
	/** @type {string?} */
	const roomID = db.prepare("SELECT room_id FROM channel_room WHERE channel_id = ?").pluck().get(data.channel_id)
	if (!roomID) return

	/** @type {string[]} */
	const eventsToRedact = db.prepare("SELECT event_id FROM event_message WHERE message_id = ?").pluck().all(data.id)

	for (const eventID of eventsToRedact) {
		// Unfortuately, we can't specify a sender to do the redaction as, unless we find out that info via the audit logs
		await api.redactEvent(roomID, eventID)
		db.prepare("DELETE FROM event_message WHERE event_id = ?").run(eventID)
	}
}

module.exports.deleteMessage = deleteMessage
