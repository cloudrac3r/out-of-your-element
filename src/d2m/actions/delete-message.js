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

	const eventsToRedact = select("event_message", "event_id", {message_id: data.id}).pluck().all()
	db.prepare("DELETE FROM message_channel WHERE message_id = ?").run(data.id)
	for (const eventID of eventsToRedact) {
		// Unfortunately, we can't specify a sender to do the redaction as, unless we find out that info via the audit logs
		await api.redactEvent(row.room_id, eventID)
	}

	await speedbump.updateCache(row.thread_parent || data.channel_id, row.speedbump_checked)
}

/**
 * @param {import("discord-api-types/v10").GatewayMessageDeleteBulkDispatchData} data
 */
async function deleteMessageBulk(data) {
	const roomID = select("channel_room", "room_id", {channel_id: data.channel_id}).pluck().get()
	if (!roomID) return

	const sids = JSON.stringify(data.ids)
	const eventsToRedact = from("event_message").pluck("event_id").and("WHERE message_id IN (SELECT value FROM json_each(?))").all(sids)
	db.prepare("DELETE FROM message_channel WHERE message_id IN (SELECT value FROM json_each(?))").run(sids)
	for (const eventID of eventsToRedact) {
		// Awaiting will make it go slower, but since this could be a long-running operation either way, we want to leave rate limit capacity for other operations
		await api.redactEvent(roomID, eventID)
	}
}

module.exports.deleteMessage = deleteMessage
module.exports.deleteMessageBulk = deleteMessageBulk
