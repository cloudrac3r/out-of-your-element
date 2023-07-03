// @ts-check

const assert = require("assert").strict
const DiscordTypes = require("discord-api-types/v10")
const passthrough = require("../../passthrough")
const {sync, discord, db} = passthrough

/** @type {import("./channel-webhook")} */
const channelWebhook = sync.require("./channel-webhook")
/** @type {import("../converters/event-to-message")} */
const eventToMessage = sync.require("../converters/event-to-message")

/** @param {import("../../types").Event.Outer<any>} event */
async function sendEvent(event) {
   // TODO: matrix equivalents...
	const roomID = await createRoom.ensureRoom(message.channel_id)
   // TODO: no need to sync the member to the other side... right?
	let senderMxid = null
	if (!message.webhook_id) {
		assert(message.member)
		senderMxid = await registerUser.ensureSimJoined(message.author, roomID)
		await registerUser.syncUser(message.author, message.member, message.guild_id, roomID)
	}

	const messages = eventToMessage.eventToMessage(event)
   assert(Array.isArray(messages))

   /** @type {DiscordTypes.APIMessage[]} */
	const messageResponses = []
	let eventPart = 0 // 0 is primary, 1 is supporting
	for (const message of messages) {
      const messageResponse = await channelWebhook.sendMessageWithWebhook(channelID, message)
      // TODO: are you sure about that? many to many? and we don't need to store which side it originated from?
		db.prepare("INSERT INTO event_message (event_id, message_id, part) VALUES (?, ?, ?)").run(event.event_id, messageResponse.id, eventPart)

		eventPart = 1 // TODO: use more intelligent algorithm to determine whether primary or supporting
		messageResponses.push(messageResponse)
	}

	return messageResponses
}

module.exports.sendEvent = sendEvent
