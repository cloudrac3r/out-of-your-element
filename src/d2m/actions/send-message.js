// @ts-check

const assert = require("assert").strict
const DiscordTypes = require("discord-api-types/v10")

const passthrough = require("../../passthrough")
const { discord, sync, db } = passthrough
/** @type {import("../converters/message-to-event")} */
const messageToEvent = sync.require("../converters/message-to-event")
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("./register-user")} */
const registerUser = sync.require("./register-user")
/** @type {import("./register-pk-user")} */
const registerPkUser = sync.require("./register-pk-user")
/** @type {import("../actions/create-room")} */
const createRoom = sync.require("../actions/create-room")
/** @type {import("../../discord/utils")} */
const dUtils = sync.require("../../discord/utils")

/**
 * @param {DiscordTypes.GatewayMessageCreateDispatchData} message
 * @param {DiscordTypes.APIGuildChannel} channel
 * @param {DiscordTypes.APIGuild} guild
 * @param {{speedbump_id: string, speedbump_webhook_id: string} | null} row data about the webhook which is proxying messages in this channel
 */
async function sendMessage(message, channel, guild, row) {
	const roomID = await createRoom.ensureRoom(message.channel_id)

	let senderMxid = null
	if (!dUtils.isWebhookMessage(message)) {
		if (message.author.id === discord.application.id) {
			// no need to sync the bot's own user
		} else {
			senderMxid = await registerUser.syncUser(message.author, message.member, channel, guild, roomID)
		}
	} else if (row && row.speedbump_webhook_id === message.webhook_id) {
		// Handle the PluralKit public instance
		if (row.speedbump_id === "466378653216014359") {
			senderMxid = await registerPkUser.syncUser(message.id, message.author, roomID, true)
		}
	}

	const events = await messageToEvent.messageToEvent(message, guild, {}, {api, snow: discord.snow})
	const eventIDs = []
	if (events.length) {
		db.prepare("INSERT OR IGNORE INTO message_channel (message_id, channel_id) VALUES (?, ?)").run(message.id, message.channel_id)
		if (senderMxid) api.sendTyping(roomID, false, senderMxid).catch(() => {})
	}
	for (const event of events) {
		const part = event === events[0] ? 0 : 1
		const reactionPart = event === events[events.length - 1] ? 0 : 1

		const eventType = event.$type
		if ("$sender" in event) senderMxid = event.$sender
		/** @type {Pick<typeof event, Exclude<keyof event, "$type" | "$sender">> & { $type?: string, $sender?: string }} */
		const eventWithoutType = {...event}
		delete eventWithoutType.$type
		delete eventWithoutType.$sender

		const useTimestamp = message["backfill"] ? new Date(message.timestamp).getTime() : undefined
		const eventID = await api.sendEvent(roomID, eventType, eventWithoutType, senderMxid, useTimestamp)
		db.prepare("INSERT INTO event_message (event_id, event_type, event_subtype, message_id, part, reaction_part, source) VALUES (?, ?, ?, ?, ?, ?, 1)").run(eventID, eventType, event.msgtype || null, message.id, part, reactionPart) // source 1 = discord

		// The primary event is part = 0 and has the most important and distinct information. It is used to provide reply previews, be pinned, and possibly future uses.
		// The first event is chosen to be the primary part because it is usually the message text content and is more likely to be distinct.
		// For example, "Reply to 'this meme made me think of you'" is more useful than "Replied to image".

		// The last event gets reaction_part = 0. Reactions are managed there because reactions are supposed to appear at the bottom.

		eventIDs.push(eventID)
	}

	return eventIDs
}

module.exports.sendMessage = sendMessage
