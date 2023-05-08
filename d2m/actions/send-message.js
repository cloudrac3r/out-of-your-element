// @ts-check

const fetch = require("node-fetch").default
const reg = require("../../matrix/read-registration.js")

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
	const event = messageToEvent.messageToEvent(message)
	const roomID = await createRoom.ensureRoom(message.channel_id)
	let senderMxid = null
	if (!message.webhook_id) {
		senderMxid = await registerUser.ensureSimJoined(message.author, roomID)
	}
	const eventID = api.sendEvent(roomID, "m.room.message", event, senderMxid)
	return eventID
}

module.exports.sendMessage = sendMessage
