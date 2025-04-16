// @ts-check

const Ty = require("../../types")
const DiscordTypes = require("discord-api-types/v10")
const stream = require("stream")
const assert = require("assert").strict
const crypto = require("crypto")
const passthrough = require("../../passthrough")
const {sync, discord, db, select} = passthrough

/** @type {import("./channel-webhook")} */
const channelWebhook = sync.require("./channel-webhook")
/** @type {import("../converters/event-to-message")} */
const eventToMessage = sync.require("../converters/event-to-message")
/** @type {import("../../matrix/api")}) */
const api = sync.require("../../matrix/api")
/** @type {import("../../d2m/actions/register-user")} */
const registerUser = sync.require("../../d2m/actions/register-user")
/** @type {import("../../d2m/actions/edit-message")} */
const editMessage = sync.require("../../d2m/actions/edit-message")
/** @type {import("../actions/emoji-sheet")} */
const emojiSheet = sync.require("../actions/emoji-sheet")

/**
 * @param {DiscordTypes.RESTPostAPIWebhookWithTokenJSONBody & {files?: {name: string, file: Buffer | stream.Readable}[], pendingFiles?: ({name: string, mxc: string} | {name: string, mxc: string, key: string, iv: string} | {name: string, buffer: Buffer | stream.Readable})[]}} message
 * @returns {Promise<DiscordTypes.RESTPostAPIWebhookWithTokenJSONBody & {files?: {name: string, file: Buffer | stream.Readable}[]}>}
 */
async function resolvePendingFiles(message) {
	if (!message.pendingFiles) return message
	const files = await Promise.all(message.pendingFiles.map(async p => {
		if ("buffer" in p) {
			return {
				name: p.name,
				file: p.buffer
			}
		}
		if ("key" in p) {
			// Encrypted file
			const d = crypto.createDecipheriv("aes-256-ctr", Buffer.from(p.key, "base64url"), Buffer.from(p.iv, "base64url"))
			await api.getMedia(p.mxc).then(res => stream.Readable.fromWeb(res.body).pipe(d))
			return {
				name: p.name,
				file: d
			}
		} else {
			// Unencrypted file
			const body = await api.getMedia(p.mxc).then(res => stream.Readable.fromWeb(res.body))
			return {
				name: p.name,
				file: body
			}
		}
	}))
	const newMessage = {
		...message,
		files: files.concat(message.files || [])
	}
	delete newMessage.pendingFiles
	return newMessage
}

/** @param {Ty.Event.Outer_M_Room_Message | Ty.Event.Outer_M_Room_Message_File | Ty.Event.Outer_M_Sticker} event */
async function sendEvent(event) {
	const row = select("channel_room", ["channel_id", "thread_parent"], {room_id: event.room_id}).get()
	if (!row) return [] // allow the bot to exist in unbridged rooms, just don't do anything with it
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

	let {messagesToEdit, messagesToSend, messagesToDelete, ensureJoined} = await eventToMessage.eventToMessage(event, guild, {api, snow: discord.snow, mxcDownloader: emojiSheet.getAndConvertEmoji})

	messagesToEdit = await Promise.all(messagesToEdit.map(async e => {
		e.message = await resolvePendingFiles(e.message)
		return e
	}))
	messagesToSend = await Promise.all(messagesToSend.map(message => {
		return resolvePendingFiles(message)
	}))

	let eventPart = 0 // 0 is primary, 1 is supporting
	const pendingEdits = []

	/** @type {DiscordTypes.APIMessage[]} */
	const messageResponses = []
	for (const data of messagesToEdit) {
		const messageResponse = await channelWebhook.editMessageWithWebhook(channelID, data.id, data.message, threadID)
		eventPart = 1
		messageResponses.push(messageResponse)
	}

	for (const id of messagesToDelete) {
		db.prepare("DELETE FROM message_channel WHERE message_id = ?").run(id)
		await channelWebhook.deleteMessageWithWebhook(channelID, id, threadID)
	}

	for (const message of messagesToSend) {
		const reactionPart = messagesToEdit.length === 0 && message === messagesToSend[messagesToSend.length - 1] ? 0 : 1
		const messageResponse = await channelWebhook.sendMessageWithWebhook(channelID, message, threadID)
		db.prepare("INSERT INTO message_channel (message_id, channel_id) VALUES (?, ?)").run(messageResponse.id, threadID || channelID)
		db.prepare("INSERT INTO event_message (event_id, event_type, event_subtype, message_id, part, reaction_part, source) VALUES (?, ?, ?, ?, ?, ?, 0)").run(event.event_id, event.type, event.content["msgtype"] || null, messageResponse.id, eventPart, reactionPart) // source 0 = matrix

		eventPart = 1
		messageResponses.push(messageResponse)

		/*
			If the Discord system has a cached link preview embed for one of the links just sent,
			it will be instantly added as part of `embeds` and there won't be a MESSAGE_UPDATE.
			To reflect the generated embed back to Matrix, we pretend the message was updated right away.
		*/
		const sentEmbedsCount = message.embeds?.length || 0
		if (messageResponse.embeds.length > sentEmbedsCount) {
			// not awaiting here because requests to Matrix shouldn't block requests to Discord
			pendingEdits.push(() =>
				// @ts-ignore this is a valid message edit payload
				editMessage.editMessage({
					id: messageResponse.id,
					channel_id: messageResponse.channel_id,
					guild_id: guild.id,
					embeds: messageResponse.embeds
				}, guild, null)
			)
		}
	}

	for (const user of ensureJoined) {
		registerUser.ensureSimJoined(user, event.room_id)
	}

	await Promise.all(pendingEdits.map(f => f())) // `await` will propagate any errors during editing

	return messageResponses
}

module.exports.sendEvent = sendEvent
