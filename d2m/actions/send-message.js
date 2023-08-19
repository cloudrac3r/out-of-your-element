// @ts-check

const assert = require("assert")

const passthrough = require("../../passthrough")
const { discord, sync, db } = passthrough
/** @type {import("../converters/message-to-event")} */
const messageToEvent = sync.require("../converters/message-to-event")
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("./register-user")} */
const registerUser = sync.require("./register-user")
/** @type {import("../actions/create-room")} */
const createRoom = sync.require("../actions/create-room")

/**
 * @param {import("discord-api-types/v10").GatewayMessageCreateDispatchData} message
 * @param {import("discord-api-types/v10").APIGuild} guild
 */
async function sendMessage(message, guild) {
	const roomID = await createRoom.ensureRoom(message.channel_id)

	let senderMxid = null
	if (!message.webhook_id) {
		if (message.member) { // available on a gateway message create event
			senderMxid = await registerUser.syncUser(message.author, message.member, message.guild_id, roomID)
		} else { // well, good enough...
			senderMxid = await registerUser.ensureSimJoined(message.author, roomID)
		}
	}

	const events = await messageToEvent.messageToEvent(message, guild, {}, {api})
	const eventIDs = []
	let eventPart = 0 // 0 is primary, 1 is supporting
	for (const event of events) {
		const eventType = event.$type
		/** @type {Pick<typeof event, Exclude<keyof event, "$type">> & { $type?: string }} */
		const eventWithoutType = {...event}
		delete eventWithoutType.$type

		const eventID = await api.sendEvent(roomID, eventType, event, senderMxid, new Date(message.timestamp).getTime())
		db.prepare("INSERT INTO event_message (event_id, event_type, event_subtype, message_id, channel_id, part, source) VALUES (?, ?, ?, ?, ?, ?, 1)").run(eventID, eventType, event.msgtype || null, message.id, message.channel_id, eventPart) // source 1 = discord

		eventPart = 1 // TODO: use more intelligent algorithm to determine whether primary or supporting
		eventIDs.push(eventID)
	}

	return eventIDs
}

module.exports.sendMessage = sendMessage
