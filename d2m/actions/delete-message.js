// @ts-check

const passthrough = require("../../passthrough")
const {sync, db, select} = passthrough
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")

/**
 * @param {import("discord-api-types/v10").GatewayMessageDeleteDispatchData} data
 */
async function deleteMessage(data) {
	const roomID = select("channel_room", "room_id", {channel_id: data.channel_id}).pluck().get()
	if (!roomID) return

	const eventsToRedact = select("event_message", "event_id", {message_id: data.id}).pluck().all()
	for (const eventID of eventsToRedact) {
		// Unfortunately, we can't specify a sender to do the redaction as, unless we find out that info via the audit logs
		await api.redactEvent(roomID, eventID)
		db.prepare("DELETE FROM event_message WHERE event_id = ?").run(eventID)
	}
}

module.exports.deleteMessage = deleteMessage
