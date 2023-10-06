// @ts-check

const passthrough = require("../../passthrough")
const {sync, db, select} = passthrough
/** @type {import("../converters/edit-to-changes")} */
const editToChanges = sync.require("../converters/edit-to-changes")
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")

/**
 * @param {import("discord-api-types/v10").GatewayMessageCreateDispatchData} message
 * @param {import("discord-api-types/v10").APIGuild} guild
 */
async function editMessage(message, guild) {
	const {roomID, eventsToRedact, eventsToReplace, eventsToSend, senderMxid, promoteEvent, promoteNextEvent} = await editToChanges.editToChanges(message, guild, api)

	// 1. Replace all the things.
	for (const {oldID, newContent} of eventsToReplace) {
		const eventType = newContent.$type
		/** @type {Pick<typeof newContent, Exclude<keyof newContent, "$type">> & { $type?: string }} */
		const newContentWithoutType = {...newContent}
		delete newContentWithoutType.$type

		await api.sendEvent(roomID, eventType, newContentWithoutType, senderMxid)
		// Ensure the database is up to date.
		// The columns are event_id, event_type, event_subtype, message_id, channel_id, part, source. Only event_subtype could potentially be changed by a replacement event.
		const subtype = newContentWithoutType.msgtype || null
		db.prepare("UPDATE event_message SET event_subtype = ? WHERE event_id = ?").run(subtype, oldID)
	}

	// 2. Redact all the things.
	// Not redacting as the last action because the last action is likely to be shown in the room preview in clients, and we don't want it to look like somebody actually deleted a message.
	for (const eventID of eventsToRedact) {
		await api.redactEvent(roomID, eventID, senderMxid)
		db.prepare("DELETE FROM event_message WHERE event_id = ?").run(eventID)
	}

	// 3. Consistency: Ensure there is exactly one part = 0
	let eventPart = 1
	if (promoteEvent) {
		db.prepare("UPDATE event_message SET part = 0 WHERE event_id = ?").run(promoteEvent)
	} else if (promoteNextEvent) {
		eventPart = 0
	}

	// 4. Send all the things.
	for (const content of eventsToSend) {
		const eventType = content.$type
		/** @type {Pick<typeof content, Exclude<keyof content, "$type">> & { $type?: string }} */
		const contentWithoutType = {...content}
		delete contentWithoutType.$type

		const eventID = await api.sendEvent(roomID, eventType, contentWithoutType, senderMxid)
		db.prepare("INSERT INTO event_message (event_id, event_type, event_subtype, message_id, part, source) VALUES (?, ?, ?, ?, ?, 1)").run(eventID, eventType, content.msgtype || null, message.id, eventPart) // part 1 = supporting; source 1 = discord

		eventPart = 1
	}
}

module.exports.editMessage = editMessage
