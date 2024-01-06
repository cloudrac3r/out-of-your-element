// @ts-check

const assert = require("assert").strict
const markdown = require("discord-markdown")
const pb = require("prettier-bytes")
const DiscordTypes = require("discord-api-types/v10")
const {tag} = require("html-template-tag")

const passthrough = require("../../passthrough")
const {sync, db, discord, select, from} = passthrough
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")
/** @type {import("./emoji-to-key")} */
const emojiToKey = sync.require("./emoji-to-key")
/** @type {import("./lottie")} */
const lottie = sync.require("./lottie")
/** @type {import("../../m2d/converters/utils")} */
const mxUtils = sync.require("../../m2d/converters/utils")
/** @type {import("../../discord/utils")} */
const dUtils = sync.require("../../discord/utils")
const reg = require("../../matrix/read-registration")

const userRegex = reg.namespaces.users.map(u => new RegExp(u.regex))

/**
 * @param {DiscordTypes.APIMessage} message
 * @param {DiscordTypes.APIGuild} guild
 * @param {boolean} useHTML
 */
function getDiscordParseCallbacks(message, guild, useHTML) {
	return {
		/** @param {{id: string, type: "discordUser"}} node */
		user: node => {
			const mxid = select("sim", "mxid", {user_id: node.id}).pluck().get()
			const username = message.mentions.find(ment => ment.id === node.id)?.username || node.id
			if (mxid && useHTML) {
				return `<a href="https://matrix.to/#/${mxid}">@${username}</a>`
			} else {
				return `@${username}:`
			}
		},
		/** @param {{id: string, type: "discordChannel"}} node */
		channel: node => {
			const row = select("channel_room", ["room_id", "name", "nick"], {channel_id: node.id}).get()
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
				const mxc = select("emoji", "mxc_url", {emoji_id: node.id}).pluck().get()
				assert(mxc) // All emojis should have been added ahead of time in the messageToEvent function.
				return `<img data-mx-emoticon height="32" src="${mxc}" title=":${node.name}:" alt=":${node.name}:">`
			} else {
				return `:${node.name}:`
			}
		},
		role: node => {
			const role = guild.roles.find(r => r.id === node.id)
			if (!role) {
				// This fallback should only trigger if somebody manually writes a silly message, or if the cache breaks (hasn't happened yet).
				// If the cache breaks, fix discord-packets.js to store role info properly.
				return "@&" + node.id
			} else if (useHTML && role.color) {
				return `<font color="#${role.color.toString(16)}">@${role.name}</font>`
			} else if (useHTML) {
				return `<span data-mx-color="#ffffff" data-mx-bg-color="#414eef">@${role.name}</span>`
			} else {
				return `@${role.name}:`
			}
		},
		everyone: node =>
			"@room",
		here: node =>
			"@here"
	}
}

const embedTitleParser = markdown.markdownEngine.parserFor({
	...markdown.rules,
	autolink: undefined,
	link: undefined
})

/**
 * @param {{room?: boolean, user_ids?: string[]}} mentions
 * @param {DiscordTypes.APIAttachment} attachment
 */
async function attachmentToEvent(mentions, attachment) {
	const emoji =
		attachment.content_type?.startsWith("image/jp") ? "📸"
		: attachment.content_type?.startsWith("image/") ? "🖼️"
		: attachment.content_type?.startsWith("video/") ? "🎞️"
		: attachment.content_type?.startsWith("text/") ? "📝"
		: attachment.content_type?.startsWith("audio/") ? "🎶"
		: "📄"
	// no native media spoilers in Element, so we'll post a link instead, forcing it to not preview using a blockquote
	if (attachment.filename.startsWith("SPOILER_")) {
		return {
			$type: "m.room.message",
			"m.mentions": mentions,
			msgtype: "m.text",
			body: `${emoji} Uploaded SPOILER file: ${attachment.url} (${pb(attachment.size)})`,
			format: "org.matrix.custom.html",
			formatted_body: `<blockquote>${emoji} Uploaded SPOILER file: <a href="${attachment.url}">${attachment.url}</a> (${pb(attachment.size)})</blockquote>`
		}
	}
	// for large files, always link them instead of uploading so I don't use up all the space in the content repo
	else if (attachment.size > reg.ooye.max_file_size) {
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
			body: attachment.description || attachment.filename,
			filename: attachment.filename,
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
	} else if (attachment.content_type?.startsWith("audio/")) {
		return {
			$type: "m.room.message",
			"m.mentions": mentions,
			msgtype: "m.audio",
			url: await file.uploadDiscordFileToMxc(attachment.url),
			external_url: attachment.url,
			body: attachment.description || attachment.filename,
			filename: attachment.filename,
			info: {
				mimetype: attachment.content_type,
				size: attachment.size,
				duration: attachment.duration_secs ? attachment.duration_secs * 1000 : undefined
			}
		}
	} else {
		return {
			$type: "m.room.message",
			"m.mentions": mentions,
			msgtype: "m.file",
			url: await file.uploadDiscordFileToMxc(attachment.url),
			external_url: attachment.url,
			body: attachment.description || attachment.filename,
			filename: attachment.filename,
			info: {
				mimetype: attachment.content_type,
				size: attachment.size
			}
		}
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

	if (message.type === DiscordTypes.MessageType.ThreadCreated) {
		// This is the kind of message that appears when somebody makes a thread which isn't close enough to the message it's based off.
		// It lacks the lines and the pill, so it looks kind of like a member join message, and it says:
		// [#] NICKNAME started a thread: __THREAD NAME__. __See all threads__
		// We're already bridging the THREAD_CREATED gateway event to make a comparable message, so drop this one.
		return []
	}

	if (message.type === DiscordTypes.MessageType.ThreadStarterMessage) {
		// This is the message that appears at the top of a thread when the thread was based off an existing message.
		// It's just a message reference, no content.
		const ref = message.message_reference
		assert(ref)
		assert(ref.message_id)
		const eventID = select("event_message", "event_id", {message_id: ref.message_id}).pluck().get()
		const roomID = select("channel_room", "room_id", {channel_id: ref.channel_id}).pluck().get()
		if (!eventID || !roomID) return []
		const event = await di.api.getEvent(roomID, eventID)
		return [{
			...event.content,
			$type: event.type,
			$sender: null
		}]
	}

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
	let repliedToEventRow = null
	let repliedToEventSenderMxid = null

	function addMention(mxid) {
		if (!mentions.user_ids) mentions.user_ids = []
		if (!mentions.user_ids.includes(mxid)) mentions.user_ids.push(mxid)
	}

	// Mentions scenarios 1 and 2, part A. i.e. translate relevant message.mentions to m.mentions
	// (Still need to do scenarios 1 and 2 part B, and scenario 3.)
	if (message.type === DiscordTypes.MessageType.Reply && message.message_reference?.message_id) {
		const row = from("event_message").join("message_channel", "message_id").join("channel_room", "channel_id").select("event_id", "room_id", "source").and("WHERE message_id = ? AND part = 0").get(message.message_reference.message_id)
		if (row) {
			repliedToEventRow = row
		}
	}
	if (repliedToEventRow && repliedToEventRow.source === 0) { // reply was originally from Matrix
		// Need to figure out who sent that event...
		const event = await di.api.getEvent(repliedToEventRow.room_id, repliedToEventRow.event_id)
		repliedToEventSenderMxid = event.sender
		// Need to add the sender to m.mentions
		addMention(repliedToEventSenderMxid)
	}

	/**
	 * Translate Discord message links to Matrix event links.
	 * If OOYE has handled this message in the past, this is an instant database lookup.
	 * Otherwise, if OOYE knows the channel, this is a multi-second request to /timestamp_to_event to approximate.
	 * @param {string} content Partial or complete Discord message content
	 */
	async function transformContentMessageLinks(content) {
		let offset = 0
		for (const match of [...content.matchAll(/https:\/\/(?:ptb\.|canary\.|www\.)?discord(?:app)?\.com\/channels\/[0-9]+\/([0-9]+)\/([0-9]+)/g)]) {
			assert(typeof match.index === "number")
			const [_, channelID, messageID] = match
			let result

			const roomID = select("channel_room", "room_id", {channel_id: channelID}).pluck().get()
			if (roomID) {
				const eventID = select("event_message", "event_id", {message_id: messageID}).pluck().get()
				if (eventID && roomID) {
					result = `https://matrix.to/#/${roomID}/${eventID}`
				} else {
					const ts = dUtils.snowflakeToTimestampExact(messageID)
					const {event_id} = await di.api.getEventForTimestamp(roomID, ts)
					result = `https://matrix.to/#/${roomID}/${event_id}`
				}
			} else {
				result = `${match[0]} [event is from another server]`
			}

			content = content.slice(0, match.index + offset) + result + content.slice(match.index + match[0].length + offset)
			offset += result.length - match[0].length
		}
		return content
	}

	/**
	 * Translate links and emojis and mentions and stuff. Give back the text and HTML so they can be combined into bigger events.
	 * @param {string} content Partial or complete Discord message content
	 * @param {any} customOptions
	 * @param {any} customParser
	 * @param {any} customHtmlOutput
	 */
	async function transformContent(content, customOptions = {}, customParser = null, customHtmlOutput = null) {
		content = await transformContentMessageLinks(content)

		// Handling emojis that we don't know about. The emoji has to be present in the DB for it to be picked up in the emoji markdown converter.
		// So we scan the message ahead of time for all its emojis and ensure they are in the DB.
		const emojiMatches = [...content.matchAll(/<(a?):([^:>]{2,64}):([0-9]+)>/g)]
		await Promise.all(emojiMatches.map(match => {
			const id = match[3]
			const name = match[2]
			const animated = !!match[1]
			return emojiToKey.emojiToKey({id, name, animated}) // Register the custom emoji if needed
		}))

		let html = markdown.toHTML(content, {
			discordCallback: getDiscordParseCallbacks(message, guild, true),
			...customOptions
		}, customParser, customHtmlOutput)

		let body = markdown.toHTML(content, {
			discordCallback: getDiscordParseCallbacks(message, guild, false),
			discordOnly: true,
			escapeHTML: false,
			...customOptions
		}, null, null)

		return {body, html}
	}

	async function addTextEvent(body, html, msgtype, {scanMentions}) {
		// Star * prefix for fallback edits
		if (options.includeEditFallbackStar) {
			body = "* " + body
			html = "* " + html
		}

		const flags = message.flags || 0
		if (flags & 2) {
			body = `[🔀 ${message.author.username}]\n` + body
			html = `🔀 <strong>${message.author.username}</strong><br>` + html
		}

		// Fallback body/formatted_body for replies
		// This branch is optional - do NOT change anything apart from the reply fallback, since it may not be run
		if (repliedToEventRow && options.includeReplyFallback !== false) {
			let repliedToDisplayName
			let repliedToUserHtml
			if (repliedToEventRow?.source === 0 && repliedToEventSenderMxid) {
				const match = repliedToEventSenderMxid.match(/^@([^:]*)/)
				assert(match)
				repliedToDisplayName = match[1] || "a Matrix user" // grab the localpart as the display name, whatever
				repliedToUserHtml = `<a href="https://matrix.to/#/${repliedToEventSenderMxid}">${repliedToDisplayName}</a>`
			} else {
				repliedToDisplayName = message.referenced_message?.author.global_name || message.referenced_message?.author.username || "a Discord user"
				repliedToUserHtml = repliedToDisplayName
			}
			let repliedToContent = message.referenced_message?.content
			if (repliedToContent?.startsWith("> <:L1:")) {
				// If the Discord user is replying to a Matrix user's reply, the fallback is going to contain the emojis and stuff from the bridged rep of the Matrix user's reply quote.
				// Need to remove that previous reply rep from this fallback body. The fallbody body should only contain the Matrix user's actual message.
				repliedToContent = repliedToContent.split("\n").slice(2).join("\n")
			}
			if (repliedToContent == "") repliedToContent = "[Media]"
			else if (!repliedToContent) repliedToContent = "[Replied-to message content wasn't provided by Discord]"
			const repliedToHtml = markdown.toHTML(repliedToContent, {
				discordCallback: getDiscordParseCallbacks(message, guild, true)
			}, null, null)
			const repliedToBody = markdown.toHTML(repliedToContent, {
				discordCallback: getDiscordParseCallbacks(message, guild, false),
				discordOnly: true,
				escapeHTML: false,
			}, null, null)
			html = `<mx-reply><blockquote><a href="https://matrix.to/#/${repliedToEventRow.room_id}/${repliedToEventRow.event_id}">In reply to</a> ${repliedToUserHtml}`
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


	let msgtype = "m.text"
	// Handle message type 4, channel name changed
	if (message.type === DiscordTypes.MessageType.ChannelNameChange) {
		msgtype = "m.emote"
		message.content = "changed the channel name to **" + message.content + "**"
	}

	// Mentions scenario 3: scan the message content for written @mentions of matrix users. Allows for up to one space between @ and mention.
	const matches = [...message.content.matchAll(/@ ?([a-z0-9._]+)\b/gi)]
	if (matches.length && matches.some(m => m[1].match(/[a-z]/i))) {
		const writtenMentionsText = matches.map(m => m[1].toLowerCase())
		const roomID = select("channel_room", "room_id", {channel_id: message.channel_id}).pluck().get()
		assert(roomID)
		const {joined} = await di.api.getJoinedMembers(roomID)
		for (const [mxid, member] of Object.entries(joined)) {
			if (!userRegex.some(rx => mxid.match(rx))) {
				const localpart = mxid.match(/@([^:]*)/)
				assert(localpart)
				const displayName = member.display_name || localpart[1]
				if (writtenMentionsText.includes(localpart[1].toLowerCase()) || writtenMentionsText.includes(displayName.toLowerCase())) addMention(mxid)
			}
		}
	}

	// Text content appears first
	if (message.content) {
		const {body, html} = await transformContent(message.content)
		await addTextEvent(body, html, msgtype, {scanMentions: true})
	}

	// Then attachments
	const attachmentEvents = await Promise.all(message.attachments.map(attachmentToEvent.bind(null, mentions)))
	events.push(...attachmentEvents)

	// Then embeds
	for (const embed of message.embeds || []) {
		if (embed.type === "image") {
			continue // Matrix's own image embeds are fine.
		}

		// Start building up a replica ("rep") of the embed in Discord-markdown format, which we will convert into both plaintext and formatted body at once
		const rep = new mxUtils.MatrixStringBuilder()

		// Author and URL into a paragraph
		let authorNameText = embed.author?.name || ""
		if (authorNameText && embed.author?.icon_url) authorNameText = `⏺️ ${authorNameText}` // using the emoji instead of an image
		if (authorNameText || embed.author?.url) {
			if (embed.author?.url) {
				const authorURL = await transformContentMessageLinks(embed.author.url)
				rep.addParagraph(`## ${authorNameText} ${authorURL}`, tag`<strong><a href="${authorURL}">${authorNameText}</a></strong>`)
			} else {
				rep.addParagraph(`## ${authorNameText}`, tag`<strong>${authorNameText}</strong>`)
			}
		}

		// Title and URL into a paragraph
		if (embed.title) {
			const {body, html} = await transformContent(embed.title, {}, embedTitleParser, markdown.htmlOutput)
			if (embed.url) {
				rep.addParagraph(`## ${body} ${embed.url}`, tag`<strong><a href="${embed.url}">$${html}</a></strong>`)
			} else {
				rep.addParagraph(`## ${body}`, `<strong>${html}</strong>`)
			}
		} else if (embed.url) {
			rep.addParagraph(`## ${embed.url}`, tag`<strong><a href="${embed.url}">${embed.url}</a></strong>`)
		}

		if (embed.description) {
			const {body, html} = await transformContent(embed.description)
			rep.addParagraph(body, html)
		}

		for (const field of embed.fields || []) {
			const name = field.name.match(/^[\s​­]*$/) ? {body: "", html: ""} : await transformContent(field.name, {}, embedTitleParser, markdown.htmlOutput)
			const value = await transformContent(field.value)
			const fieldRep = new mxUtils.MatrixStringBuilder()
				.addLine(`### ${name.body}`, `<strong>${name.html}</strong>`, name.body)
				.addLine(value.body, value.html, !!value.body)
			rep.addParagraph(fieldRep.get().body, fieldRep.get().formatted_body)
		}

		if (embed.image?.url) rep.addParagraph(`📸 ${embed.image.url}`)
		if (embed.video?.url) rep.addParagraph(`🎞️ ${embed.video.url}`)

		if (embed.footer?.text) rep.addLine(`— ${embed.footer.text}`, tag`— ${embed.footer.text}`)
		let {body, formatted_body: html} = rep.get()
		body = body.split("\n").map(l => "> " + l).join("\n")
		html = `<blockquote>${html}</blockquote>`

		// Send as m.notice to apply the usual automated/subtle appearance, showing this wasn't actually typed by the person
		await addTextEvent(body, html, "m.notice", {scanMentions: false})
	}

	// Then stickers
	if (message.sticker_items) {
		const stickerEvents = await Promise.all(message.sticker_items.map(async stickerItem => {
			const format = file.stickerFormat.get(stickerItem.format_type)
			if (format?.mime === "lottie") {
				try {
					const {mxc_url, info} = await lottie.convert(stickerItem)
					return {
						$type: "m.sticker",
						"m.mentions": mentions,
						body: stickerItem.name,
						info,
						url: mxc_url
					}
				} catch (e) {
					return {
						$type: "m.room.message",
						"m.mentions": mentions,
						msgtype: "m.notice",
						body: `Failed to convert Lottie sticker:\n${e.toString()}\n${e.stack}`
					}
				}
			} else if (format?.mime) {
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
			}
			return {
				$type: "m.room.message",
				"m.mentions": mentions,
				msgtype: "m.notice",
				body: `Unsupported sticker format ${format?.mime}. Name: ${stickerItem.name}`
			}
		}))
		events.push(...stickerEvents)
	}

	// Rich replies
	if (repliedToEventRow) {
		Object.assign(events[0], {
			"m.relates_to": {
				"m.in_reply_to": {
					event_id: repliedToEventRow.event_id
				}
			}
		})
	}

	return events
}

module.exports.messageToEvent = messageToEvent
