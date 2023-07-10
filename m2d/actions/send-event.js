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
   // TODO: we just assume the bridge has already been created
	const channelID = db.prepare("SELECT channel_id FROM channel_room WHERE room_id = ?").pluck().get(event.room_id)

   // no need to sync the matrix member to the other side. but if I did need to, this is where I'd do it

	const messages = eventToMessage.eventToMessage(event)
   assert(Array.isArray(messages)) // sanity

   /** @type {DiscordTypes.APIMessage[]} */
	const messageResponses = []
	let eventPart = 0 // 0 is primary, 1 is supporting
	for (const message of messages) {
      const messageResponse = await channelWebhook.sendMessageWithWebhook(channelID, message)
		db.prepare("INSERT INTO event_message (event_id, message_id, channel_id, part, source) VALUES (?, ?, ?, ?, 0)").run(event.event_id, messageResponse.id, channelID, eventPart) // source 0 = matrix

		eventPart = 1 // TODO: use more intelligent algorithm to determine whether primary or supporting?
		messageResponses.push(messageResponse)
	}

	return messageResponses
}

module.exports.sendEvent = sendEvent
