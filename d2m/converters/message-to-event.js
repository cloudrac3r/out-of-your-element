// @ts-check

const assert = require("assert").strict
const markdown = require("discord-markdown")
const DiscordTypes = require("discord-api-types/v10")

const passthrough = require("../../passthrough")
const { sync, db, discord } = passthrough
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")
const reg = require("../../matrix/read-registration")

const userRegex = reg.namespaces.users.map(u => new RegExp(u.regex))

function getDiscordParseCallbacks(message, useHTML) {
	return {
		user: node => {
			const mxid = db.prepare("SELECT mxid FROM sim WHERE discord_id = ?").pluck().get(node.id)
			const username = message.mentions.find(ment => ment.id === node.id)?.username || node.id
			if (mxid && useHTML) {
				return `<a href="https://matrix.to/#/${mxid}">@${username}</a>`
			} else {
				return `@${username}:`
			}
		},
		channel: node => {
			const {room_id, name, nick} = db.prepare("SELECT room_id, name, nick FROM channel_room WHERE channel_id = ?").get(node.id)
			if (room_id && useHTML) {
				return `<a href="https://matrix.to/#/${room_id}">#${nick || name}</a>`
			} else {
				return `#${nick || name}`
			}
		},
		role: node =>
			"@&" + node.id,
		everyone: node =>
			"@room",
		here: node =>
			"@here"
	}
}

/**
 * @param {import("discord-api-types/v10").APIMessage} message
 * @param {import("discord-api-types/v10").APIGuild} guild
 * @param {import("../../matrix/api")} api simple-as-nails dependency injection for the matrix API
 */
async function messageToEvent(message, guild, api) {
	const events = []

	/**
	   @type {{room?: boolean, user_ids?: string[]}}
		We should consider the following scenarios for mentions:
		1. A discord user rich-replies to a matrix user with a text post
			+ The matrix user needs to be m.mentioned in the text event
			+ The matrix user needs to have their name/mxid/link in the text event (notification fallback)
				- So prepend their `@name:` to the start of the plaintext body
		2. A discord user rich-replies to a matrix user with an image event only
			+ The matrix user needs to be m.mentioned in the image event
			+ TODO The matrix user needs to have their name/mxid in the image event's body field, alongside the filename (notification fallback)
				- So append their name to the filename body, I guess!!!
		3. A discord user `@`s a matrix user in the text body of their text box
			+ The matrix user needs to be m.mentioned in the text event
			+ No change needed to the text event content: it already has their name
				- So make sure we don't do anything in this case.
	*/
	const mentions = {}
	let repliedToEventId = null
	let repliedToEventRoomId = null
	let repliedToEventSenderMxid = null
	let repliedToEventOriginallyFromMatrix = false

	function addMention(mxid) {
		if (!mentions.user_ids) mentions.user_ids = []
		if (!mentions.user_ids.includes(mxid)) mentions.user_ids.push(mxid)
	}

	// Mentions scenarios 1 and 2, part A. i.e. translate relevant message.mentions to m.mentions
	// (Still need to do scenarios 1 and 2 part B, and scenario 3.)
	if (message.type === DiscordTypes.MessageType.Reply && message.message_reference?.message_id) {
		const row = db.prepare("SELECT event_id, room_id, source FROM event_message INNER JOIN channel_room USING (channel_id) WHERE message_id = ? AND part = 0").get(message.message_reference.message_id)
		if (row) {
			repliedToEventId = row.event_id
			repliedToEventRoomId = row.room_id
			repliedToEventOriginallyFromMatrix = row.source === 0 // source 0 = matrix
		}
	}
	if (repliedToEventOriginallyFromMatrix) {
		// Need to figure out who sent that event...
		const event = await api.getEvent(repliedToEventRoomId, repliedToEventId)
		repliedToEventSenderMxid = event.sender
		// Need to add the sender to m.mentions
		addMention(repliedToEventSenderMxid)
	}

	// Text content appears first
	if (message.content) {
		let content = message.content
		content = content.replace(/https:\/\/(?:ptb\.|canary\.|www\.)?discord(?:app)?\.com\/channels\/([0-9]+)\/([0-9]+)\/([0-9]+)/, (whole, guildID, channelID, messageID) => {
			const row = db.prepare("SELECT room_id, event_id FROM event_message INNER JOIN channel_room USING (channel_id) WHERE channel_id = ? AND message_id = ? AND part = 0").get(channelID, messageID)
			if (row) {
				return `https://matrix.to/#/${row.room_id}/${row.event_id}`
			} else {
				return `${whole} [event not found]`
			}
		})

		let html = markdown.toHTML(content, {
			discordCallback: getDiscordParseCallbacks(message, true)
		}, null, null)

		// TODO: add a string return type to my discord-markdown library
		let body = markdown.toHTML(content, {
			discordCallback: getDiscordParseCallbacks(message, false),
			discordOnly: true,
			escapeHTML: false,
		}, null, null)

		// Mentions scenario 3: scan the message content for written @mentions of matrix users
		const matches = [...content.matchAll(/@([a-z0-9._]+)\b/gi)]
		if (matches.length && matches.some(m => m[1].match(/[a-z]/i))) {
			const writtenMentionsText = matches.map(m => m[1].toLowerCase())
			const roomID = db.prepare("SELECT room_id FROM channel_room WHERE channel_id = ?").pluck().get(message.channel_id)
			const {joined} = await api.getJoinedMembers(roomID)
			for (const [mxid, member] of Object.entries(joined)) {
				if (!userRegex.some(rx => mxid.match(rx))) {
					const localpart = mxid.match(/@([^:]*)/)
					assert(localpart)
					if (writtenMentionsText.includes(localpart[1].toLowerCase()) || writtenMentionsText.includes(member.display_name.toLowerCase())) addMention(mxid)
				}
			}
		}

		// Fallback body/formatted_body for replies
		if (repliedToEventId) {
			let repliedToDisplayName
			let repliedToUserHtml
			if (repliedToEventOriginallyFromMatrix && repliedToEventSenderMxid) {
				const match = repliedToEventSenderMxid.match(/^@([^:]*)/)
				assert(match)
				repliedToDisplayName = match[1] || "a Matrix user" // grab the localpart as the display name, whatever
				repliedToUserHtml = `<a href="https://matrix.to/#/${repliedToEventSenderMxid}">${repliedToDisplayName}</a>`
			} else {
				repliedToDisplayName = message.referenced_message?.author.global_name || message.referenced_message?.author.username || "a Discord user"
				repliedToUserHtml = repliedToDisplayName
			}
			const repliedToContent = message.referenced_message?.content || "[Replied-to message content wasn't provided by Discord]"
			const repliedToHtml = markdown.toHTML(repliedToContent, {
				discordCallback: getDiscordParseCallbacks(message, true)
			}, null, null)
			const repliedToBody = markdown.toHTML(repliedToContent, {
				discordCallback: getDiscordParseCallbacks(message, false),
				discordOnly: true,
				escapeHTML: false,
			}, null, null)
			html = `<mx-reply><blockquote><a href="https://matrix.to/#/${repliedToEventRoomId}/${repliedToEventId}">In reply to</a> ${repliedToUserHtml}`
				+ `<br>${repliedToHtml}</blockquote></mx-reply>`
				+ html
			body = (`${repliedToDisplayName}: ` // scenario 1 part B for mentions
				+ repliedToBody).split("\n").map(line => "> " + line).join("\n")
				+ "\n\n" + body
		}

		const newTextMessageEvent = {
			$type: "m.room.message",
			"m.mentions": mentions,
			msgtype: "m.text",
			body: body
		}

		const isPlaintext = body === html

		if (!isPlaintext) {
			Object.assign(newTextMessageEvent, {
				format: "org.matrix.custom.html",
				formatted_body: html
			})
		}

		events.push(newTextMessageEvent)
	}

	// Then attachments
	const attachmentEvents = await Promise.all(message.attachments.map(async attachment => {
		// TODO: handle large files differently - link them instead of uploading
		if (attachment.content_type?.startsWith("image/") && attachment.width && attachment.height) {
			return {
				$type: "m.room.message",
				"m.mentions": mentions,
				msgtype: "m.image",
				url: await file.uploadDiscordFileToMxc(attachment.url),
				external_url: attachment.url,
				body: attachment.filename,
				// TODO: filename: attachment.filename and then use body as the caption
				info: {
					mimetype: attachment.content_type,
					w: attachment.width,
					h: attachment.height,
					size: attachment.size
				}
			}
		} else {
			return {
				$type: "m.room.message",
				"m.mentions": mentions,
				msgtype: "m.text",
				body: "Unsupported attachment:\n" + JSON.stringify(attachment, null, 2)
			}
		}
	}))
	events.push(...attachmentEvents)

	// Then stickers
	if (message.sticker_items) {
		const stickerEvents = await Promise.all(message.sticker_items.map(async stickerItem => {
			const format = file.stickerFormat.get(stickerItem.format_type)
			if (format?.mime) {
				let body = stickerItem.name
				const sticker = guild.stickers.find(sticker => sticker.id === stickerItem.id)
				if (sticker && sticker.description) body += ` - ${sticker.description}`
				return {
					$type: "m.sticker",
					"m.mentions": mentions,
					body,
					info: {
						mimetype: format.mime
					},
					url: await file.uploadDiscordFileToMxc(file.sticker(stickerItem))
				}
			} else {
				return {
					$type: "m.room.message",
					"m.mentions": mentions,
					msgtype: "m.text",
					body: "Unsupported sticker format. Name: " + stickerItem.name
				}
			}
		}))
		events.push(...stickerEvents)
	}

	// Rich replies
	if (repliedToEventId) {
		Object.assign(events[0], {
			"m.relates_to": {
				"m.in_reply_to": {
					event_id: repliedToEventId
				}
			}
		})
	}

	return events
}

module.exports.messageToEvent = messageToEvent
