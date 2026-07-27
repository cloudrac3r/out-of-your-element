// @ts-check

const passthrough = require("../../passthrough")
const {sync, db, select, from} = passthrough
const {reg} = require("../../matrix/read-registration")
/** @type {import("../converters/edit-to-changes")} */
const editToChanges = sync.require("../converters/edit-to-changes")
/** @type {import("./speedbump")} */
const speedbump = sync.require("./speedbump")
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("../../matrix/mreq")} */
const mreq = sync.require("../../matrix/mreq")
/** @type {import("../../discord/utils")} */
const dUtils = sync.require("../../discord/utils")

/**
 * @param {import("discord-api-types/v10").GatewayMessageCreateDispatchData} message
 * @param {import("discord-api-types/v10").APIGuild} guild
 */
async function editMessage(message, guild) {
	const historicalRoomOfMessage = from("message_room").join("historical_channel_room", "historical_room_index").where({message_id: message.id}).select("room_id").get()
	const currentRoom = from("channel_room").join("historical_channel_room", "room_id").where({channel_id: message.channel_id}).select("room_id", "historical_room_index").get()
	if (!currentRoom) return

	if (historicalRoomOfMessage && historicalRoomOfMessage.room_id !== currentRoom.room_id) return // tombstoned rooms should not have new events (including edits) sent to them

	let {roomID, eventsToRedact, eventsToReplace, eventsToSend, senderMxid, promotions} = await editToChanges.editToChanges(message, guild, api)

	// Sync proxy user profile (if sent by proxy)
	if (dUtils.isWebhookMessage(message)) {
		senderMxid = await speedbump.getWebhookSenderId(message, guild.id, roomID)
	}

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
	const sendNewEventParts = new Set()
	for (const promotion of promotions) {
		if ("eventID" in promotion) {
			db.prepare(`UPDATE event_message SET ${promotion.column} = ? WHERE event_id = ?`).run(promotion.value ?? 0, promotion.eventID)
		} else if ("nextEvent" in promotion) {
			sendNewEventParts.add(promotion.column)
		}
	}

	// 4. Send all the things.
	if (eventsToSend.length) {
		db.prepare("INSERT OR IGNORE INTO message_room (message_id, historical_room_index) VALUES (?, ?)").run(message.id, currentRoom.historical_room_index)
	}
	for (const content of eventsToSend) {
		const eventType = content.$type
		/** @type {Pick<typeof content, Exclude<keyof content, "$type">> & { $type?: string }} */
		const contentWithoutType = {...content}
		delete contentWithoutType.$type
		delete contentWithoutType.$sender

		const part = sendNewEventParts.has("part") && eventsToSend[0] === content ? 0 : 1
		const reactionPart = sendNewEventParts.has("reaction_part") && eventsToSend[eventsToSend.length - 1] === content ? 0 : 1

		try {
			const eventID = await api.sendEvent(roomID, eventType, contentWithoutType, senderMxid)
			db.prepare("INSERT INTO event_message (event_id, event_type, event_subtype, message_id, part, reaction_part, source) VALUES (?, ?, ?, ?, ?, ?, 1)").run(eventID, eventType, content.msgtype || null, message.id, part, reactionPart) // source 1 = discord
		} catch (e) {
			if (e instanceof mreq.MatrixServerError && e.errcode === "M_FORBIDDEN") {
				// sending user doesn't have permission to update message, e.g. because Discord generated an embed in a read-only room
			} else {
				throw e
			}
		}
	}
}

module.exports.editMessage = editMessage
