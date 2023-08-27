// @ts-check

const assert = require("assert").strict
const DiscordTypes = require("discord-api-types/v10")
const passthrough = require("../../passthrough")
const {sync, discord, db} = passthrough

/** @type {import("./channel-webhook")} */
const channelWebhook = sync.require("./channel-webhook")
/** @type {import("../converters/event-to-message")} */
const eventToMessage = sync.require("../converters/event-to-message")
/** @type {import("../../matrix/api")}) */
const api = sync.require("../../matrix/api")

/** @param {import("../../types").Event.Outer<any>} event */
async function sendEvent(event) {
	// TODO: we just assume the bridge has already been created
	const row = db.prepare("SELECT channel_id, thread_parent FROM channel_room WHERE room_id = ?").get(event.room_id)
	let channelID = row.channel_id
	let threadID = undefined
	if (row.thread_parent) {
		threadID = channelID
		channelID = row.thread_parent // it's the thread's parent... get with the times...
	}
	// @ts-ignore
	const guildID = discord.channels.get(channelID).guild_id
	const guild = discord.guilds.get(guildID)
	assert(guild)

	// no need to sync the matrix member to the other side. but if I did need to, this is where I'd do it

	const {messagesToEdit, messagesToSend, messagesToDelete} = await eventToMessage.eventToMessage(event, guild, {api})

	/** @type {DiscordTypes.APIMessage[]} */
	const messageResponses = []
	let eventPart = 0 // 0 is primary, 1 is supporting
	// for (const message of messagesToEdit) {
	//	eventPart = 1
	//	TODO ...
	for (const message of messagesToSend) {
		const messageResponse = await channelWebhook.sendMessageWithWebhook(channelID, message, threadID)
		db.prepare("INSERT INTO event_message (event_id, event_type, event_subtype, message_id, channel_id, part, source) VALUES (?, ?, ?, ?, ?, ?, 0)").run(event.event_id, event.type, event.content.msgtype || null, messageResponse.id, channelID, eventPart) // source 0 = matrix

		eventPart = 1 // TODO: use more intelligent algorithm to determine whether primary or supporting?
		messageResponses.push(messageResponse)
	}

	return messageResponses
}

module.exports.sendEvent = sendEvent
