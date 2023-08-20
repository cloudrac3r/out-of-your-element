// @ts-check

const assert = require("assert").strict
const markdown = require("discord-markdown")
const pb = require("prettier-bytes")
const DiscordTypes = require("discord-api-types/v10")

const passthrough = require("../../passthrough")
const { sync, db, discord } = passthrough
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")
const reg = require("../../matrix/read-registration")

const userRegex = reg.namespaces.users.map(u => new RegExp(u.regex))

function getDiscordParseCallbacks(message, useHTML) {
	return {
		/** @param {{id: string, type: "discordUser"}} node */
		user: node => {
			const mxid = db.prepare("SELECT mxid FROM sim WHERE discord_id = ?").pluck().get(node.id)
			const username = message.mentions.find(ment => ment.id === node.id)?.username || node.id
			if (mxid && useHTML) {
				return `<a href="https://matrix.to/#/${mxid}">@${username}</a>`
			} else {
				return `@${username}:`
			}
		},
		/** @param {{id: string, type: "discordChannel"}} node */
		channel: node => {
			const row = db.prepare("SELECT room_id, name, nick FROM channel_room WHERE channel_id = ?").get(node.id)
			if (!row) {
				return `<#${node.id}>` // fallback for when this channel is not bridged
			} else if (useHTML) {
				return `<a href="https://matrix.to/#/${row.room_id}">#${row.nick || row.name}</a>`
			} else {
				return `#${row.nick || row.name}`
			}
		},
		/** @param {{animated: boolean, name: string, id: string, type: "discordEmoji"}} node */
		emoji: node => {
			if (useHTML) {
				// TODO: upload the emoji and actually use the right mxc!!
				return `<img src="mxc://cadence.moe/${node.id}" data-mx-emoticon alt=":${node.name}:" title=":${node.name}:" height="24">`
			} else {
				return `:${node.name}:`
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
 * @param {{includeReplyFallback?: boolean, includeEditFallbackStar?: boolean}} options default values:
 * - includeReplyFallback: true
 * - includeEditFallbackStar: false
 * @param {{api: import("../../matrix/api")}} di simple-as-nails dependency injection for the matrix API
 */
async function messageToEvent(message, guild, options = {}, di) {
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
		const event = await di.api.getEvent(repliedToEventRoomId, repliedToEventId)
		repliedToEventSenderMxid = event.sender
		// Need to add the sender to m.mentions
		addMention(repliedToEventSenderMxid)
	}

	let msgtype = "m.text"
	// Handle message type 4, channel name changed
	if (message.type === DiscordTypes.MessageType.ChannelNameChange) {
		msgtype = "m.emote"
		message.content = "changed the channel name to **" + message.content + "**"
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

		// Mentions scenario 3: scan the message content for written @mentions of matrix users. Allows for up to one space between @ and mention.
		const matches = [...content.matchAll(/@ ?([a-z0-9._]+)\b/gi)]
		if (matches.length && matches.some(m => m[1].match(/[a-z]/i))) {
			const writtenMentionsText = matches.map(m => m[1].toLowerCase())
			const roomID = db.prepare("SELECT room_id FROM channel_room WHERE channel_id = ?").pluck().get(message.channel_id)
			const {joined} = await di.api.getJoinedMembers(roomID)
			for (const [mxid, member] of Object.entries(joined)) {
				if (!userRegex.some(rx => mxid.match(rx))) {
					const localpart = mxid.match(/@([^:]*)/)
					assert(localpart)
					if (writtenMentionsText.includes(localpart[1].toLowerCase()) || writtenMentionsText.includes(member.display_name.toLowerCase())) addMention(mxid)
				}
			}
		}

		// Star * prefix for fallback edits
		if (options.includeEditFallbackStar) {
			body = "* " + body
			html = "* " + html
		}

		// Fallback body/formatted_body for replies
		// This branch is optional - do NOT change anything apart from the reply fallback, since it may not be run
		if (repliedToEventId && options.includeReplyFallback !== false) {
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
			let repliedToContent = message.referenced_message?.content
			if (repliedToContent == "") repliedToContent = "[Media]"
			else if (!repliedToContent) repliedToContent = "[Replied-to message content wasn't provided by Discord]"
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
			msgtype,
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
		const emoji =
			attachment.content_type?.startsWith("image/jp") ? "📸"
			: attachment.content_type?.startsWith("image/") ? "🖼️"
			: attachment.content_type?.startsWith("video/") ? "🎞️"
			: attachment.content_type?.startsWith("text/") ? "📝"
			: attachment.content_type?.startsWith("audio/") ? "🎶"
			: "📄"
		// for large files, always link them instead of uploading so I don't use up all the space in the content repo
		if (attachment.size > reg.ooye.max_file_size) {
			return {
				$type: "m.room.message",
				"m.mentions": mentions,
				msgtype: "m.text",
				body: `${emoji} Uploaded file: ${attachment.url} (${pb(attachment.size)})`,
				format: "org.matrix.custom.html",
				formatted_body: `${emoji} Uploaded file: <a href="${attachment.url}">${attachment.filename}</a> (${pb(attachment.size)})`
			}
		} else if (attachment.content_type?.startsWith("image/") && attachment.width && attachment.height) {
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
		} else if (attachment.content_type?.startsWith("video/") && attachment.width && attachment.height) {
			return {
				$type: "m.room.message",
				"m.mentions": mentions,
				msgtype: "m.video",
				url: await file.uploadDiscordFileToMxc(attachment.url),
				external_url: attachment.url,
				body: attachment.description || attachment.filename,
				filename: attachment.filename,
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
				body: `Unsupported attachment:\n${JSON.stringify(attachment, null, 2)}\n${attachment.url}`
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
