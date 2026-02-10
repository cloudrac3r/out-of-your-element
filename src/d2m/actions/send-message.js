// @ts-check

const assert = require("assert").strict
const DiscordTypes = require("discord-api-types/v10")

const passthrough = require("../../passthrough")
const { discord, sync, db, select, from} = passthrough
/** @type {import("../converters/message-to-event")} */
const messageToEvent = sync.require("../converters/message-to-event")
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("./register-user")} */
const registerUser = sync.require("./register-user")
/** @type {import("./register-pk-user")} */
const registerPkUser = sync.require("./register-pk-user")
/** @type {import("./register-webhook-user")} */
const registerWebhookUser = sync.require("./register-webhook-user")
/** @type {import("../actions/create-room")} */
const createRoom = sync.require("../actions/create-room")
/** @type {import("../actions/poll-end")} */
const pollEnd = sync.require("../actions/poll-end")
/** @type {import("../../discord/utils")} */
const dUtils = sync.require("../../discord/utils")
/** @type {import("../../m2d/actions/channel-webhook")} */
const channelWebhook = sync.require("../../m2d/actions/channel-webhook")

/**
 * @param {DiscordTypes.GatewayMessageCreateDispatchData} message
 * @param {DiscordTypes.APIGuildChannel} channel
 * @param {DiscordTypes.APIGuild} guild
 * @param {{speedbump_id: string, speedbump_webhook_id: string} | null} row data about the webhook which is proxying messages in this channel
 */
async function sendMessage(message, channel, guild, row) {
	const roomID = await createRoom.ensureRoom(message.channel_id)
	const historicalRoomIndex = select("historical_channel_room", "historical_room_index", {room_id: roomID}).pluck().get()
	assert(historicalRoomIndex)

	let senderMxid = null
	if (dUtils.isWebhookMessage(message)) {
		const useWebhookProfile = select("guild_space", "webhook_profile", {guild_id: guild.id}).pluck().get() ?? 0
		if (row && row.speedbump_webhook_id === message.webhook_id) {
			// Handle the PluralKit public instance
			if (row.speedbump_id === "466378653216014359") {
				senderMxid = await registerPkUser.syncUser(message.id, message.author, roomID, true)
			}
		} else if (useWebhookProfile) {
			senderMxid = await registerWebhookUser.syncUser(message.author, roomID, true)
		}
	} else {
		// not a webhook
		if (message.author.id === discord.application.id) {
			// no need to sync the bot's own user
		} else {
			senderMxid = await registerUser.syncUser(message.author, message.member, channel, guild, roomID)
		}
	}

	let sentResultsMessage
	if (message.type === DiscordTypes.MessageType.PollResult) { // ensure all Discord-side votes were pushed to Matrix before a poll is closed
		const detailedResultsMessage = await pollEnd.endPoll(message)
		if (detailedResultsMessage) {
			const threadParent = select("channel_room", "thread_parent", {channel_id: message.channel_id}).pluck().get()
			const channelID = threadParent ? threadParent : message.channel_id
			const threadID = threadParent ? message.channel_id : undefined
			sentResultsMessage = await channelWebhook.sendMessageWithWebhook(channelID, detailedResultsMessage, threadID)
		}
	}

	const events = await messageToEvent.messageToEvent(message, guild, {}, {api, snow: discord.snow})
	const eventIDs = []
	if (events.length) {
		db.prepare("INSERT OR IGNORE INTO message_room (message_id, historical_room_index) VALUES (?, ?)").run(message.id, historicalRoomIndex)
		const typingMxid = from("sim").join("sim_member", "mxid").where({user_id: message.author.id, room_id: roomID}).pluck("mxid").get()
		if (typingMxid) api.sendTyping(roomID, false, typingMxid).catch(() => {})
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
		eventIDs.push(eventID)

		try {
			db.prepare("INSERT INTO event_message (event_id, event_type, event_subtype, message_id, part, reaction_part, source) VALUES (?, ?, ?, ?, ?, ?, 1)").run(eventID, eventType, event.msgtype || null, message.id, part, reactionPart) // source 1 = discord
		} catch (e) {
			// check if we got rugpulled
			if (!select("message_room", "message_id", {message_id: message.id}).get()) {
				for (const eventID of eventIDs) {
					await api.redactEvent(roomID, eventID)
				}
				return []
			}
		}

		// The primary event is part = 0 and has the most important and distinct information. It is used to provide reply previews, be pinned, and possibly future uses.
		// The first event is chosen to be the primary part because it is usually the message text content and is more likely to be distinct.
		// For example, "Reply to 'this meme made me think of you'" is more useful than "Replied to image".

		// The last event gets reaction_part = 0. Reactions are managed there because reactions are supposed to appear at the bottom.


		if (eventType === "org.matrix.msc3381.poll.start") {
			db.transaction(() => {
				db.prepare("INSERT INTO poll (message_id, max_selections, question_text, is_closed) VALUES (?, ?, ?, 0)").run(
					message.id,
					event["org.matrix.msc3381.poll.start"].max_selections,
					event["org.matrix.msc3381.poll.start"].question["org.matrix.msc1767.text"]
				)
				for (const [index, option] of Object.entries(event["org.matrix.msc3381.poll.start"].answers)) {
					db.prepare("INSERT INTO poll_option (message_id, matrix_option, discord_option, option_text, seq) VALUES (?, ?, ?, ?, ?)").run(
						message.id,
						option.id,
						option.id,
						option["org.matrix.msc1767.text"],
						index
					)
				}
			})()
		}

		// part/reaction_part consistency for polls
		if (sentResultsMessage) {
			db.transaction(() => {
				db.prepare("INSERT OR IGNORE INTO message_room (message_id, historical_room_index) VALUES (?, ?)").run(sentResultsMessage.id, historicalRoomIndex)
				db.prepare("UPDATE event_message SET reaction_part = 1 WHERE event_id = ?").run(eventID)
				// part = 1, reaction_part = 0, source = 0 as the results are "from Matrix" and doing otherwise breaks things when that message gets updated by Discord (it just does that sometimes)
				db.prepare("INSERT INTO event_message (event_id, event_type, event_subtype, message_id, part, reaction_part, source) VALUES (?, ?, ?, ?, ?, ?, 0)").run(eventID, eventType, event.msgtype || null, sentResultsMessage.id, 1, 0)
			})()
		}
	}

	return eventIDs
}

module.exports.sendMessage = sendMessage
