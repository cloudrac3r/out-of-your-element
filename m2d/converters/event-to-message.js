// @ts-check

const Ty = require("../../types")
const DiscordTypes = require("discord-api-types/v10")
const {Readable} = require("stream")
const chunk = require("chunk-text")
const TurndownService = require("turndown")
const assert = require("assert").strict
const entities = require("entities")

const passthrough = require("../../passthrough")
const {sync, db, discord, select, from} = passthrough
/** @type {import("../converters/utils")} */
const utils = sync.require("../converters/utils")
/** @type {import("./emoji-sheet")} */
const emojiSheet = sync.require("./emoji-sheet")

/** @type {[RegExp, string][]} */
const markdownEscapes = [
	[/\\/g, '\\\\'],
	[/\*/g, '\\*'],
	[/^-/g, '\\-'],
	[/^\+ /g, '\\+ '],
	[/^(=+)/g, '\\$1'],
	[/^(#{1,6}) /g, '\\$1 '],
	[/`/g, '\\`'],
	[/^~~~/g, '\\~~~'],
	[/\[/g, '\\['],
	[/\]/g, '\\]'],
	[/^>/g, '\\>'],
	[/_/g, '\\_'],
	[/^(\d+)\. /g, '$1\\. ']
 ]

const turndownService = new TurndownService({
	hr: "----",
	headingStyle: "atx",
	preformattedCode: true,
	codeBlockStyle: "fenced",
})

/**
 * Markdown characters in the HTML content need to be escaped, though take care not to escape the middle of bare links
 * @param {string} string
 */
// @ts-ignore bad type from turndown
turndownService.escape = function (string) {
	const escapedWords = string.split(" ").map(word => {
		if (word.match(/^https?:\/\//)) {
			return word
		} else {
			return markdownEscapes.reduce(function (accumulator, escape) {
				return accumulator.replace(escape[0], escape[1])
		 	}, word)
		}
	})
	return escapedWords.join(" ")
}

turndownService.remove("mx-reply")

turndownService.addRule("strikethrough", {
	filter: ["del", "s"],
	replacement: function (content) {
		return "~~" + content + "~~"
	}
})

turndownService.addRule("underline", {
	filter: ["u"],
	replacement: function (content) {
		return "__" + content + "__"
	}
})

turndownService.addRule("blockquote", {
	filter: "blockquote",
	replacement: function (content) {
		content = content.replace(/^\n+|\n+$/g, "")
		content = content.replace(/^/gm, "> ")
		return content
	}
})

turndownService.addRule("spoiler", {
	filter: function (node, options) {
		return node.hasAttribute("data-mx-spoiler")
	},

	replacement: function (content, node) {
		return "||" + content + "||"
	}
})

turndownService.addRule("inlineLink", {
	filter: function (node, options) {
		return (
			node.nodeName === "A" &&
			node.getAttribute("href")
		)
	},

	replacement: function (content, node) {
		if (node.getAttribute("data-user-id")) return `<@${node.getAttribute("data-user-id")}>`
		if (node.getAttribute("data-channel-id")) return `<#${node.getAttribute("data-channel-id")}>`
		const href = node.getAttribute("href")
		let brackets = ["", ""]
		if (href.startsWith("https://matrix.to")) brackets = ["<", ">"]
		return "[" + content + "](" + brackets[0] + href + brackets[1] + ")"
	}
})

turndownService.addRule("listItem", {
	filter: "li",
	replacement: function (content, node, options) {
		content = content
		.replace(/^\n+/, "") // remove leading newlines
		.replace(/\n+$/, "\n") // replace trailing newlines with just a single one
		.replace(/\n/gm, "\n  ") // indent
		var prefix = options.bulletListMarker + " "
		var parent = node.parentNode
		if (parent.nodeName === "OL") {
			var start = parent.getAttribute("start")
			var index = Array.prototype.indexOf.call(parent.children, node)
			prefix = (start ? Number(start) + index : index + 1) + ".  "
		}
		return prefix + content + (node.nextSibling && !/\n$/.test(content) ? "\n" : "")
	}
})

/** @type {string[]} SPRITE SHEET EMOJIS FEATURE: mxc urls for the currently processing message */
let endOfMessageEmojis = []
turndownService.addRule("emoji", {
	filter: function (node, options) {
		if (node.nodeName !== "IMG" || !node.hasAttribute("data-mx-emoticon") || !node.getAttribute("src") || !node.getAttribute("title")) return false
		return true
	},

	replacement: function (content, node) {
		const mxcUrl = node.getAttribute("src")
		// Get the known emoji from the database. (We may not be able to actually use this if it was from another server.)
		const row = select("emoji", ["emoji_id", "name", "animated"], {mxc_url: mxcUrl}).get()
		// Also guess a suitable emoji based on the ID (if available) or name
		let guess = null
		const guessedName = node.getAttribute("title").replace(/^:|:$/g, "")
		for (const guild of discord.guilds.values()) {
			/** @type {{name: string, id: string, animated: number}[]} */
			// @ts-ignore
			const emojis = guild.emojis
			const match = emojis.find(e => e.id === row?.emoji_id) || emojis.find(e => e.name === guessedName) || emojis.find(e => e.name?.toLowerCase() === guessedName.toLowerCase())
			if (match) {
				guess = match
				break
			}
		}
		if (guess) {
			// We know an emoji, and we can use it
			const animatedChar = guess.animated ? "a" : ""
			return `<${animatedChar}:${guess.name}:${guess.id}>`
		} else if (endOfMessageEmojis.includes(mxcUrl)) {
			// We can't locate or use a suitable emoji. After control returns, it will rewind over this, delete this section, and upload the emojis as a sprite sheet.
			return `<::>`
		} else {
			// We prefer not to upload this as a sprite sheet because the emoji is not at the end of the message, it is in the middle.
			return `[${node.getAttribute("title")}](${utils.getPublicUrlForMxc(mxcUrl)})`
		}
	}
})

turndownService.addRule("fencedCodeBlock", {
	filter: function (node, options) {
		return (
			options.codeBlockStyle === "fenced" &&
			node.nodeName === "PRE" &&
			node.firstChild &&
			node.firstChild.nodeName === "CODE"
		)
	},
	replacement: function (content, node, options) {
		const className = node.firstChild.getAttribute("class") || ""
		const language = (className.match(/language-(\S+)/) || [null, ""])[1]
		const code = node.firstChild
		const visibleCode = code.childNodes.map(c => c.nodeName === "BR" ? "\n" : c.textContent).join("").replace(/\n*$/g, "")

		var fence = "```"

		return (
			fence + language + "\n" +
			visibleCode +
			"\n" + fence
		)
	}
})

/**
 * @param {string} roomID
 * @param {string} mxid
 * @returns {Promise<{displayname?: string?, avatar_url?: string?}>}
 */
async function getMemberFromCacheOrHomeserver(roomID, mxid, api) {
	const row = select("member_cache", ["displayname", "avatar_url"], {room_id: roomID, mxid}).get()
	if (row) return row
	return api.getStateEvent(roomID, "m.room.member", mxid).then(event => {
		db.prepare("REPLACE INTO member_cache (room_id, mxid, displayname, avatar_url) VALUES (?, ?, ?, ?)").run(roomID, mxid, event?.displayname || null, event?.avatar_url || null)
		return event
	}).catch(() => {
		return {displayname: null, avatar_url: null}
	})
}

/**
 * Splits a display name into one chunk containing <=80 characters, and another chunk containing the rest of the characters. Splits on
 * whitespace if possible.
 * These chunks, respectively, go in the display name, and at the top of the message.
 * If the second part isn't empty, it'll also contain boldening markdown and a line break at the end, so that regardless of its value it
 * can be prepended to the message content as-is.
 * @summary Splits too-long Matrix names into a display name chunk and a message content chunk.
 * @param  {string} displayName - The Matrix side display name to chop up.
 * @returns {[string, string]} [shortened display name, display name runoff]
 */
function splitDisplayName(displayName) {
	/** @type {string[]} */
	let displayNameChunks = chunk(displayName, 80)

	if (displayNameChunks.length === 1) {
		return [displayName, ""]
	} else {
		const displayNamePreRunoff = displayNameChunks[0]
		// displayNameRunoff is a slice of the original rather than a concatenation of the rest of the chunks in order to preserve whatever whitespace it was broken on.
		const displayNameRunoff = `**${displayName.slice(displayNamePreRunoff.length + 1)}**\n`

		return [displayNamePreRunoff, displayNameRunoff]
	}
}

/**
 * At the time of this executing, we know what the end of message emojis are, and we know that at least one of them is unknown.
 * This function will strip them from the content and generate the correct pending file of the sprite sheet.
 * @param {string} content
 * @param {{id: string, name: string}[]} attachments
 * @param {({name: string, url: string} | {name: string, url: string, key: string, iv: string} | {name: string, buffer: Buffer})[]} pendingFiles
 */
async function uploadEndOfMessageSpriteSheet(content, attachments, pendingFiles) {
	if (!content.includes("<::>")) return content // No unknown emojis, nothing to do
	// Remove known and unknown emojis from the end of the message
	const r = /<a?:[a-zA-Z0-9_]*:[0-9]*>\s*$/
	while (content.match(r)) {
		content = content.replace(r, "")
	}
	// Create a sprite sheet of known and unknown emojis from the end of the message
	const buffer = await emojiSheet.compositeMatrixEmojis(endOfMessageEmojis)
	// Attach it
	const name = "emojis.png"
	attachments.push({id: "0", name})
	pendingFiles.push({name, buffer})
	return content
}

/**
 * @param {Ty.Event.Outer_M_Room_Message | Ty.Event.Outer_M_Room_Message_File | Ty.Event.Outer_M_Sticker | Ty.Event.Outer_M_Room_Message_Encrypted_File} event
 * @param {import("discord-api-types/v10").APIGuild} guild
 * @param {{api: import("../../matrix/api")}} di simple-as-nails dependency injection for the matrix API
 */
async function eventToMessage(event, guild, di) {
	/** @type {(DiscordTypes.RESTPostAPIWebhookWithTokenJSONBody & {files?: {name: string, file: Buffer | Readable}[]})[]} */
	let messages = []

	let displayName = event.sender
	let avatarURL = undefined
	/** @type {string[]} */
	let messageIDsToEdit = []
	let replyLine = ""
	// Extract a basic display name from the sender
	const match = event.sender.match(/^@(.*?):/)
	if (match) displayName = match[1]
	// Try to extract an accurate display name and avatar URL from the member event
	const member = await getMemberFromCacheOrHomeserver(event.room_id, event.sender, di?.api)
	if (member.displayname) displayName = member.displayname
	if (member.avatar_url) avatarURL = utils.getPublicUrlForMxc(member.avatar_url) || undefined
	// If the display name is too long to be put into the webhook (80 characters is the maximum),
	// put the excess characters into displayNameRunoff, later to be put at the top of the message
	let [displayNameShortened, displayNameRunoff] = splitDisplayName(displayName)
	// If the message type is m.emote, the full name is already included at the start of the message, so remove any runoff
	if (event.type === "m.room.message" && event.content.msgtype === "m.emote") {
		displayNameRunoff = ""
	}

	let content = event.content.body // ultimate fallback
	const attachments = []
	/** @type {({name: string, url: string} | {name: string, url: string, key: string, iv: string} | {name: string, buffer: Buffer})[]} */
	const pendingFiles = []

	// Convert content depending on what the message is
	if (event.type === "m.room.message" && (event.content.msgtype === "m.text" || event.content.msgtype === "m.emote")) {
		// Handling edits. If the edit was an edit of a reply, edits do not include the reply reference, so we need to fetch up to 2 more events.
		// this event ---is an edit of--> original event ---is a reply to--> past event
		await (async () => {
			if (!event.content["m.new_content"]) return
			const relatesTo = event.content["m.relates_to"]
			if (!relatesTo) return
			// Check if we have a pointer to what was edited
			const relType = relatesTo.rel_type
			if (relType !== "m.replace") return
			const originalEventId = relatesTo.event_id
			if (!originalEventId) return
			messageIDsToEdit = select("event_message", "message_id", {event_id: originalEventId}, "ORDER BY part").pluck().all()
			if (!messageIDsToEdit.length) return

			// Ok, it's an edit.
			event.content = event.content["m.new_content"]

			// Is it editing a reply? We need special handling if it is.
			// Get the original event, then check if it was a reply
			const originalEvent = await di.api.getEvent(event.room_id, originalEventId)
			if (!originalEvent) return
			const repliedToEventId = originalEvent.content["m.relates_to"]?.["m.in_reply_to"]?.event_id
			if (!repliedToEventId) return

			// After all that, it's an edit of a reply.
			// We'll be sneaky and prepare the message data so that the next steps can handle it just like original messages.
			Object.assign(event.content, {
				"m.relates_to": {
					"m.in_reply_to": {
						event_id: repliedToEventId
					}
				}
			})
		})()

		// Handling replies. We'll look up the data of the replied-to event from the Matrix homeserver.
		// Note that an <mx-reply> element is not guaranteed because this might be m.new_content.
		await (async () => {
			const repliedToEventId = event.content["m.relates_to"]?.["m.in_reply_to"]?.event_id
			if (!repliedToEventId) return
			let repliedToEvent = await di.api.getEvent(event.room_id, repliedToEventId)
			if (!repliedToEvent) return
			// @ts-ignore
			const autoEmoji = new Map(select("auto_emoji", ["name", "emoji_id"], {}, "WHERE name = 'L1' OR name = 'L2'").raw().all())
			replyLine = `<:L1:${autoEmoji.get("L1")}><:L2:${autoEmoji.get("L2")}>`
			const row = from("event_message").join("message_channel", "message_id").select("channel_id", "message_id").where({event_id: repliedToEventId}).and("ORDER BY part").get()
			if (row) {
				replyLine += `https://discord.com/channels/${guild.id}/${row.channel_id}/${row.message_id} `
			}
			const sender = repliedToEvent.sender
			const authorID = select("sim", "user_id", {mxid: repliedToEvent.sender}).pluck().get()
			if (authorID) {
				replyLine += `<@${authorID}>`
			} else {
				let senderName = select("member_cache", "displayname", {mxid: repliedToEvent.sender}).pluck().get()
				if (!senderName) senderName = sender.match(/@([^:]*)/)?.[1] || sender
				replyLine += `Ⓜ️**${senderName}**`
			}
			// If the event has been edited, the homeserver will include the relation in `unsigned`.
			if (repliedToEvent.unsigned?.["m.relations"]?.["m.replace"]?.content?.["m.new_content"]) {
				repliedToEvent = repliedToEvent.unsigned["m.relations"]["m.replace"] // Note: this changes which event_id is in repliedToEvent.
				repliedToEvent.content = repliedToEvent.content["m.new_content"]
			}
			let contentPreview
			const fileReplyContentAlternative =
				( repliedToEvent.content.msgtype === "m.image" ? "🖼️"
				: repliedToEvent.content.msgtype === "m.video" ? "🎞️"
				: repliedToEvent.content.msgtype === "m.audio" ? "🎶"
				: repliedToEvent.content.msgtype === "m.file" ? "📄"
				: null)
			if (fileReplyContentAlternative) {
				contentPreview = " " + fileReplyContentAlternative
			} else {
				const repliedToContent = repliedToEvent.content.formatted_body || repliedToEvent.content.body
				const contentPreviewChunks = chunk(
					entities.decodeHTML5Strict( // Remove entities like &amp; &quot;
						repliedToContent.replace(/.*<\/mx-reply>/, "") // Remove everything before replies, so just use the actual message body
						.replace(/^\s*<blockquote>.*?<\/blockquote>(.....)/s, "$1") // If the message starts with a blockquote, don't count it and use the message body afterwards
						.replace(/(?:\n|<br>)+/g, " ") // Should all be on one line
						.replace(/<span [^>]*data-mx-spoiler\b[^>]*>.*?<\/span>/g, "[spoiler]") // Good enough method of removing spoiler content. (I don't want to break out the HTML parser unless I have to.)
						.replace(/<[^>]+>/g, "") // Completely strip all HTML tags and formatting.
					), 50)
				contentPreview = ":\n> "
				contentPreview += contentPreviewChunks.length > 1 ? contentPreviewChunks[0] + "..." : contentPreviewChunks[0]
			}
			replyLine = `> ${replyLine}${contentPreview}\n`
		})()

		if (event.content.format === "org.matrix.custom.html" && event.content.formatted_body) {
			let input = event.content.formatted_body
			if (event.content.msgtype === "m.emote") {
				input = `* ${displayName} ${input}`
			}

			// Handling mentions of Discord users
			input = input.replace(/("https:\/\/matrix.to\/#\/(@[^"]+)")>/g, (whole, attributeValue, mxid) => {
				if (!utils.eventSenderIsFromDiscord(mxid)) return whole
				const userID = select("sim", "user_id", {mxid: mxid}).pluck().get()
				if (!userID) return whole
				return `${attributeValue} data-user-id="${userID}">`
			})

			// Handling mentions of Discord rooms
			input = input.replace(/("https:\/\/matrix.to\/#\/(![^"]+)")>/g, (whole, attributeValue, roomID) => {
				const channelID = select("channel_room", "channel_id", {room_id: roomID}).pluck().get()
				if (!channelID) return whole
				return `${attributeValue} data-channel-id="${channelID}">`
			})

			// Stripping colons after mentions
			input = input.replace(/( data-user-id.*?<\/a>):?/g, "$1")
			input = input.replace(/("https:\/\/matrix.to.*?<\/a>):?/g, "$1")

			// Element adds a bunch of <br> before </blockquote> but doesn't render them. I can't figure out how this even works in the browser, so let's just delete those.
			input = input.replace(/(?:\n|<br ?\/?>\s*)*<\/blockquote>/g, "</blockquote>")

			// The matrix spec hasn't decided whether \n counts as a newline or not, but I'm going to count it, because if it's in the data it's there for a reason.
			// But I should not count it if it's between block elements.
			input = input.replace(/(<\/?([^ >]+)[^>]*>)?\n(<\/?([^ >]+)[^>]*>)?/g, (whole, beforeContext, beforeTag, afterContext, afterTag) => {
				// console.error(beforeContext, beforeTag, afterContext, afterTag)
				if (typeof beforeTag !== "string" && typeof afterTag !== "string") {
					return "<br>"
				}
				beforeContext = beforeContext || ""
				beforeTag = beforeTag || ""
				afterContext = afterContext || ""
				afterTag = afterTag || ""
				if (!utils.BLOCK_ELEMENTS.includes(beforeTag.toUpperCase()) && !utils.BLOCK_ELEMENTS.includes(afterTag.toUpperCase())) {
					return beforeContext + "<br>" + afterContext
				} else {
					return whole
				}
			})

			// Note: Element's renderers on Web and Android currently collapse whitespace, like the browser does. Turndown also collapses whitespace which is good for me.
			// If later I'm using a client that doesn't collapse whitespace and I want turndown to follow suit, uncomment the following line of code, and it Just Works:
			// input = input.replace(/ /g, "&nbsp;")
			// There is also a corresponding test to uncomment, named "event2message: whitespace is retained"

			// SPRITE SHEET EMOJIS FEATURE: Emojis at the end of the message that we don't know about will be reuploaded as a sprite sheet.
			// First we need to determine which emojis are at the end.
			endOfMessageEmojis = []
			let match
			let last = input.length
			while ((match = input.slice(0, last).match(/<img [^>]*>\s*$/))) {
				if (!match[0].includes("data-mx-emoticon")) break
				const mxcUrl = match[0].match(/\bsrc="(mxc:\/\/[^"]+)"/)
				if (mxcUrl) endOfMessageEmojis.unshift(mxcUrl[1])
				if (typeof match.index !== "number") break
				last = match.index
			}

			// @ts-ignore bad type from turndown
			content = turndownService.turndown(input)

			// It's designed for commonmark, we need to replace the space-space-newline with just newline
			content = content.replace(/  \n/g, "\n")

			// SPRITE SHEET EMOJIS FEATURE:
			content = await uploadEndOfMessageSpriteSheet(content, attachments, pendingFiles)
		} else {
			// Looks like we're using the plaintext body!
			content = event.content.body

			if (event.content.msgtype === "m.emote") {
				content = `* ${displayName} ${content}`
			}

			// Markdown needs to be escaped, though take care not to escape the middle of links
			// @ts-ignore bad type from turndown
			content = turndownService.escape(content)
		}
	} else if (event.type === "m.room.message" && (event.content.msgtype === "m.file" || event.content.msgtype === "m.video" || event.content.msgtype === "m.audio" || event.content.msgtype === "m.image")) {
		content = ""
		const filename = event.content.body
		if ("url" in event.content) {
			// Unencrypted
			const url = utils.getPublicUrlForMxc(event.content.url)
			assert(url)
			attachments.push({id: "0", filename})
			pendingFiles.push({name: filename, url})
		} else {
			// Encrypted
			const url = utils.getPublicUrlForMxc(event.content.file.url)
			assert(url)
			assert.equal(event.content.file.key.alg, "A256CTR")
			attachments.push({id: "0", filename})
			pendingFiles.push({name: filename, url, key: event.content.file.key.k, iv: event.content.file.iv})
		}
	} else if (event.type === "m.sticker") {
		content = ""
		const url = utils.getPublicUrlForMxc(event.content.url)
		assert(url)
		let filename = event.content.body
		if (event.type === "m.sticker") {
			let mimetype
			if (event.content.info?.mimetype?.includes("/")) {
				mimetype = event.content.info.mimetype
			} else {
				const res = await fetch(url, {method: "HEAD"})
				mimetype = res.headers.get("content-type") || "image/webp"
			}
			filename += "." + mimetype.split("/")[1]
		}
		attachments.push({id: "0", filename})
		pendingFiles.push({name: filename, url})
	}

	content = displayNameRunoff + replyLine + content

	// Split into 2000 character chunks
	const chunks = chunk(content, 2000)
	messages = messages.concat(chunks.map(content => ({
		content,
		username: displayNameShortened,
		avatar_url: avatarURL
	})))

	if (attachments.length) {
		// If content is empty (should be the case when uploading a file) then chunk-text will create 0 messages.
		// There needs to be a message to add attachments to.
		if (!messages.length) messages.push({
			content,
			username: displayNameShortened,
			avatar_url: avatarURL
		})
		messages[0].attachments = attachments
		// @ts-ignore these will be converted to real files when the message is about to be sent
		messages[0].pendingFiles = pendingFiles
	}

	const messagesToEdit = []
	const messagesToSend = []
	for (let i = 0; i < messages.length; i++) {
		const next = messageIDsToEdit[0]
		if (next) {
			messagesToEdit.push({id: next, message: messages[i]})
			messageIDsToEdit.shift()
		} else {
			messagesToSend.push(messages[i])
		}
	}

	// Ensure there is code coverage for adding, editing, and deleting
	if (messagesToSend.length) void 0
	if (messagesToEdit.length) void 0
	if (messageIDsToEdit.length) void 0

	return {
		messagesToEdit,
		messagesToSend,
		messagesToDelete: messageIDsToEdit
	}
}

module.exports.eventToMessage = eventToMessage
