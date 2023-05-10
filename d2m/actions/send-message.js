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
 */
async function sendMessage(message) {
	assert.ok(message.member)

	const event = messageToEvent.messageToEvent(message)
	const roomID = await createRoom.ensureRoom(message.channel_id)
	let senderMxid = null
	if (!message.webhook_id) {
		senderMxid = await registerUser.ensureSimJoined(message.author, roomID)
		await registerUser.syncUser(message.author, message.member, message.guild_id, roomID)
	}
	const eventID = await api.sendEvent(roomID, "m.room.message", event, senderMxid)
	db.prepare("INSERT INTO event_message (event_id, message_id, part) VALUES (?, ?, ?)").run(eventID, message.id, 0) // 0 is primary, 1 is supporting
	return eventID
}

module.exports.sendMessage = sendMessage
