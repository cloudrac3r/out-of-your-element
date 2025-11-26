// @ts-check

const passthrough = require("../../passthrough")
const {sync, db, select, from} = passthrough
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("./speedbump")} */
const speedbump = sync.require("./speedbump")

/**
 * @param {import("discord-api-types/v10").GatewayMessageDeleteDispatchData} data
 */
async function deleteMessage(data) {
	const row = select("channel_room", ["room_id", "speedbump_checked", "thread_parent"], {channel_id: data.channel_id}).get()
	if (!row) return

	// Assume we can redact from tombstoned rooms.
	const eventsToRedact = from("event_message").join("message_room", "message_id").join("historical_channel_room", "historical_room_index")
		.select("event_id", "room_id").where({message_id: data.id}).all()
	db.prepare("DELETE FROM message_room WHERE message_id = ?").run(data.id)
	for (const {event_id, room_id} of eventsToRedact) {
		// Unfortunately, we can't specify a sender to do the redaction as, unless we find out that info via the audit logs
		await api.redactEvent(room_id, event_id)
	}

	await speedbump.updateCache(row.thread_parent || data.channel_id, row.speedbump_checked)
}

/**
 * @param {import("discord-api-types/v10").GatewayMessageDeleteBulkDispatchData} data
 */
async function deleteMessageBulk(data) {
	const row = select("channel_room", "room_id", {channel_id: data.channel_id}).get()
	if (!row) return

	const sids = JSON.stringify(data.ids)
	// Assume we can redact from tombstoned rooms.
	const eventsToRedact = from("event_message").join("message_room", "message_id").join("historical_channel_room", "historical_room_index")
		.select("event_id", "room_id").and("WHERE message_id IN (SELECT value FROM json_each(?))").all(sids)
	db.prepare("DELETE FROM message_room WHERE message_id IN (SELECT value FROM json_each(?))").run(sids)
	for (const {event_id, room_id} of eventsToRedact) {
		// Awaiting will make it go slower, but since this could be a long-running operation either way, we want to leave rate limit capacity for other operations
		await api.redactEvent(room_id, event_id)
	}
}

module.exports.deleteMessage = deleteMessage
module.exports.deleteMessageBulk = deleteMessageBulk
