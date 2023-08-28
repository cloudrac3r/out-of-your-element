// @ts-check

const Ty = require("../../types")
const DiscordTypes = require("discord-api-types/v10")
const chunk = require("chunk-text")
const TurndownService = require("turndown")

const passthrough = require("../../passthrough")
const { sync, db, discord } = passthrough
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")
/** @type {import("../converters/utils")} */
const utils = sync.require("../converters/utils")

const BLOCK_ELEMENTS = [
	"ADDRESS", "ARTICLE", "ASIDE", "AUDIO", "BLOCKQUOTE", "BODY", "CANVAS",
	"CENTER", "DD", "DETAILS", "DIR", "DIV", "DL", "DT", "FIELDSET", "FIGCAPTION", "FIGURE",
	"FOOTER", "FORM", "FRAMESET", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER",
	"HGROUP", "HR", "HTML", "ISINDEX", "LI", "MAIN", "MENU", "NAV", "NOFRAMES",
	"NOSCRIPT", "OL", "OUTPUT", "P", "PRE", "SECTION", "SUMMARY", "TABLE", "TBODY", "TD",
	"TFOOT", "TH", "THEAD", "TR", "UL"
]

function cleanAttribute (attribute) {
	return attribute ? attribute.replace(/(\n+\s*)+/g, "\n") : ""
}

const turndownService = new TurndownService({
	hr: "----",
	headingStyle: "atx",
	preformattedCode: true,
	codeBlockStyle: "fenced"
})

turndownService.remove("mx-reply")

turndownService.addRule("strikethrough", {
	filter: ["del", "s", "strike"],
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

turndownService.addRule("inlineLink", {
	filter: function (node, options) {
	  return (
			options.linkStyle === "inlined" &&
			node.nodeName === "A" &&
			node.getAttribute("href")
	  )
	},

	replacement: function (content, node) {
		if (node.getAttribute("data-user-id")) return `<@${node.getAttribute("data-user-id")}>`
		if (node.getAttribute("data-channel-id")) return `<#${node.getAttribute("data-channel-id")}>`
		const href = node.getAttribute("href")
		let title = cleanAttribute(node.getAttribute("title"))
		if (title) title = ` "` + title + `"`
		let brackets = ["", ""]
		if (href.startsWith("https://matrix.to")) brackets = ["<", ">"]
		return "[" + content + "](" + brackets[0] + href + title + brackets[1] + ")"
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
	const row = db.prepare("SELECT displayname, avatar_url FROM member_cache WHERE room_id = ? AND mxid = ?").get(roomID, mxid)
	if (row) return row
	return api.getStateEvent(roomID, "m.room.member", mxid).then(event => {
		db.prepare("REPLACE INTO member_cache (room_id, mxid, displayname, avatar_url) VALUES (?, ?, ?, ?)").run(roomID, mxid, event?.displayname || null, event?.avatar_url || null)
		return event
	}).catch(() => {
		return {displayname: null, avatar_url: null}
	})
}

/**
 * @param {Ty.Event.Outer<Ty.Event.M_Room_Message>} event
 * @param {import("discord-api-types/v10").APIGuild} guild
 * @param {{api: import("../../matrix/api")}} di simple-as-nails dependency injection for the matrix API
 */
async function eventToMessage(event, guild, di) {
	/** @type {(DiscordTypes.RESTPostAPIWebhookWithTokenJSONBody & {files?: {name: string, file: Buffer}[]})[]} */
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
	if (member.avatar_url) avatarURL = utils.getPublicUrlForMxc(member.avatar_url)

	let content = event.content.body // ultimate fallback

	// Convert content depending on what the message is
	if (event.content.msgtype === "m.text" || event.content.msgtype === "m.emote") {
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
			messageIDsToEdit = db.prepare("SELECT message_id FROM event_message WHERE event_id = ? ORDER BY part").pluck().all(originalEventId)
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
			const repliedToEvent = await di.api.getEvent(event.room_id, repliedToEventId)
			if (!repliedToEvent) return
			const row = db.prepare("SELECT channel_id, message_id FROM event_message INNER JOIN message_channel USING (message_id) WHERE event_id = ? ORDER BY part").get(repliedToEventId)
			if (row) {
				replyLine = `<:L1:1144820033948762203><:L2:1144820084079087647>https://discord.com/channels/${guild.id}/${row.channel_id}/${row.message_id} `
			} else {
				replyLine = `<:L1:1144820033948762203><:L2:1144820084079087647>`
			}
			const sender = repliedToEvent.sender
			const senderName = sender.match(/@([^:]*)/)?.[1] || sender
			const authorID = db.prepare("SELECT discord_id FROM sim WHERE mxid = ?").pluck().get(repliedToEvent.sender)
			if (authorID) {
				replyLine += `<@${authorID}>:`
			} else {
				replyLine += `Ⓜ️**${senderName}**:`
			}
			const repliedToContent = repliedToEvent.content.formatted_body || repliedToEvent.content.body
			const contentPreviewChunks = chunk(repliedToContent.replace(/.*<\/mx-reply>/, "").replace(/(?:\n|<br>)+/g, " ").replace(/<[^>]+>/g, ""), 50)
			const contentPreview = contentPreviewChunks.length > 1 ? contentPreviewChunks[0] + "..." : contentPreviewChunks[0]
			replyLine = `> ${replyLine}\n> ${contentPreview}\n`
		})()

		if (event.content.format === "org.matrix.custom.html" && event.content.formatted_body) {
			let input = event.content.formatted_body
			if (event.content.msgtype === "m.emote") {
				input = `* ${displayName} ${input}`
			}

			// Handling mentions of Discord users
			input = input.replace(/("https:\/\/matrix.to\/#\/(@[^"]+)")>/g, (whole, attributeValue, mxid) => {
				if (!utils.eventSenderIsFromDiscord(mxid)) return whole
				const userID = db.prepare("SELECT discord_id FROM sim WHERE mxid = ?").pluck().get(mxid)
				if (!userID) return whole
				return `${attributeValue} data-user-id="${userID}">`
			})

			// Handling mentions of Discord rooms
			input = input.replace(/("https:\/\/matrix.to\/#\/(![^"]+)")>/g, (whole, attributeValue, roomID) => {
				const channelID = db.prepare("SELECT channel_id FROM channel_room WHERE room_id = ?").pluck().get(roomID)
				if (!channelID) return whole
				return `${attributeValue} data-channel-id="${channelID}">`
			})

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
				if (!BLOCK_ELEMENTS.includes(beforeTag.toUpperCase()) && !BLOCK_ELEMENTS.includes(afterTag.toUpperCase())) {
					return beforeContext + "<br>" + afterContext
				} else {
					return whole
				}
			})

			// Note: Element's renderers on Web and Android currently collapse whitespace, like the browser does. Turndown also collapses whitespace which is good for me.
			// If later I'm using a client that doesn't collapse whitespace and I want turndown to follow suit, uncomment the following line of code, and it Just Works:
			// input = input.replace(/ /g, "&nbsp;")
			// There is also a corresponding test to uncomment, named "event2message: whitespace is retained"

			// @ts-ignore bad type from turndown
			content = turndownService.turndown(input)

			// It's optimised for commonmark, we need to replace the space-space-newline with just newline
			content = content.replace(/  \n/g, "\n")
		} else {
			// Looks like we're using the plaintext body!
			content = event.content.body

			if (event.content.msgtype === "m.emote") {
				content = `* ${displayName} ${content}`
			}

			// Markdown needs to be escaped
			content = content.replace(/([*_~`#])/g, `\\$1`)
		}
	}

	content = replyLine + content

	// Split into 2000 character chunks
	const chunks = chunk(content, 2000)
	messages = messages.concat(chunks.map(content => ({
		content,
		username: displayName,
		avatar_url: avatarURL
	})))

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

	return {
		messagesToEdit,
		messagesToSend,
		messagesToDelete: messageIDsToEdit
	}
}

module.exports.eventToMessage = eventToMessage
