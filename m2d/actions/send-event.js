// @ts-check

const assert = require("assert").strict
const crypto = require("crypto")
const {pipeline} = require("stream")
const {promisify} = require("util")
const Ty = require("../../types")
const DiscordTypes = require("discord-api-types/v10")
const passthrough = require("../../passthrough")
const {sync, discord, db, select} = passthrough

/** @type {import("./channel-webhook")} */
const channelWebhook = sync.require("./channel-webhook")
/** @type {import("../converters/event-to-message")} */
const eventToMessage = sync.require("../converters/event-to-message")
/** @type {import("../../matrix/api")}) */
const api = sync.require("../../matrix/api")

/**
 * @param {DiscordTypes.RESTPostAPIWebhookWithTokenJSONBody & {files?: {name: string, file: Buffer}[], pendingFiles?: ({name: string, url: string} | {name: string, url: string, key: string, iv: string} | {name: string, buffer: Buffer})[]}} message
 * @returns {Promise<DiscordTypes.RESTPostAPIWebhookWithTokenJSONBody & {files?: {name: string, file: Buffer}[]}>}
 */
async function resolvePendingFiles(message) {
	if (!message.pendingFiles) return message
	const files = await Promise.all(message.pendingFiles.map(async p => {
		let fileBuffer
		if ("buffer" in p) {
			return {
				name: p.name,
				file: p.buffer
			}
		}
		if ("key" in p) {
			// Encrypted
			const d = crypto.createDecipheriv("aes-256-ctr", Buffer.from(p.key, "base64url"), Buffer.from(p.iv, "base64url"))
			fileBuffer = await fetch(p.url).then(res => res.arrayBuffer()).then(x => {
				return Buffer.concat([
					d.update(Buffer.from(x)),
					d.final()
				])
			})
		} else {
			// Unencrypted
			fileBuffer = await fetch(p.url).then(res => res.arrayBuffer()).then(x => Buffer.from(x))
		}
		return {
			name: p.name,
			file: fileBuffer // TODO: Once SnowTransfer supports ReadableStreams for attachment uploads, pass in those instead of Buffers
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
	if (!row) return // allow the bot to exist in unbridged rooms, just don't do anything with it
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

	let {messagesToEdit, messagesToSend, messagesToDelete} = await eventToMessage.eventToMessage(event, guild, {api})

	messagesToEdit = await Promise.all(messagesToEdit.map(async e => {
		e.message = await resolvePendingFiles(e.message)
		return e
	}))
	messagesToSend = await Promise.all(messagesToSend.map(message => {
		return resolvePendingFiles(message)
	}))

	let eventPart = 0 // 0 is primary, 1 is supporting

	/** @type {DiscordTypes.APIMessage[]} */
	const messageResponses = []
	for (const data of messagesToEdit) {
		const messageResponse = await channelWebhook.editMessageWithWebhook(channelID, data.id, data.message, threadID)
		eventPart = 1
		messageResponses.push(messageResponse)
	}

	for (const id of messagesToDelete) {
		await channelWebhook.deleteMessageWithWebhook(channelID, id, threadID)
	}

	for (const message of messagesToSend) {
		const reactionPart = messagesToEdit.length === 0 && message === messagesToSend[messagesToSend.length - 1] ? 0 : 1
		const messageResponse = await channelWebhook.sendMessageWithWebhook(channelID, message, threadID)
		db.prepare("REPLACE INTO message_channel (message_id, channel_id) VALUES (?, ?)").run(messageResponse.id, threadID || channelID)
		db.prepare("INSERT INTO event_message (event_id, event_type, event_subtype, message_id, part, reaction_part, source) VALUES (?, ?, ?, ?, ?, ?, 0)").run(event.event_id, event.type, event.content["msgtype"] || null, messageResponse.id, eventPart, reactionPart) // source 0 = matrix

		eventPart = 1
		messageResponses.push(messageResponse)
	}

	return messageResponses
}

module.exports.sendEvent = sendEvent
