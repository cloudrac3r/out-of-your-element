// @ts-check

const passthrough = require("../../passthrough")
const { sync, db } = passthrough
/** @type {import("../converters/edit-to-changes")} */
const editToChanges = sync.require("../converters/edit-to-changes")
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")

/**
 * @param {import("discord-api-types/v10").GatewayMessageDeleteDispatchData} data
 */
async function deleteMessage(data) {
	/** @type {string?} */
	const roomID = db.prepare("SELECT channel_id FROM channel_room WHERE channel_id = ?").pluck().get(data.channel_id)
	if (!roomID) return

	/** @type {string[]} */
	const eventsToRedact = db.prepare("SELECT event_id FROM event_message WHERE message_id = ?").pluck().all(data.id)

	for (const eventID of eventsToRedact) {
		// Unfortuately, we can't specify a sender to do the redaction as, unless we find out that info via the audit logs
		await api.redactEvent(roomID, eventID)
		db.prepare("DELETE from event_message WHERE event_id = ?").run(eventID)
		// TODO: Consider whether this code could be reused between edited messages and deleted messages.
	}
}

module.exports.deleteMessage = deleteMessage
