// @ts-check

const Ty = require("../../types")
const DiscordTypes = require("discord-api-types/v10")
const chunk = require("chunk-text")
const TurndownService = require("turndown")

const passthrough = require("../../passthrough")
const { sync, db, discord } = passthrough
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")

const BLOCK_ELEMENTS = [
	"ADDRESS", "ARTICLE", "ASIDE", "AUDIO", "BLOCKQUOTE", "BODY", "CANVAS",
	"CENTER", "DD", "DETAILS", "DIR", "DIV", "DL", "DT", "FIELDSET", "FIGCAPTION", "FIGURE",
	"FOOTER", "FORM", "FRAMESET", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER",
	"HGROUP", "HR", "HTML", "ISINDEX", "LI", "MAIN", "MENU", "NAV", "NOFRAMES",
	"NOSCRIPT", "OL", "OUTPUT", "P", "PRE", "SECTION", "SUMMARY", "TABLE", "TBODY", "TD",
	"TFOOT", "TH", "THEAD", "TR", "UL"
]

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

turndownService.addRule("blockquote", {
	filter: "blockquote",
	replacement: function (content) {
		content = content.replace(/^\n+|\n+$/g, "")
		content = content.replace(/^/gm, "> ")
		return content
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
 * @param {Ty.Event.Outer<Ty.Event.M_Room_Message>} event
 * @param {import("discord-api-types/v10").APIGuild} guild
 * @param {{api: import("../../matrix/api")}} di simple-as-nails dependency injection for the matrix API
 */
async function eventToMessage(event, guild, di) {
	/** @type {(DiscordTypes.RESTPostAPIWebhookWithTokenJSONBody & {files?: {name: string, file: Buffer}[]})[]} */
	let messages = []

	let displayName = event.sender
	let avatarURL = undefined
	let replyLine = ""
	const match = event.sender.match(/^@(.*?):/)
	if (match) {
		displayName = match[1]
		// TODO: get the media repo domain and the avatar url from the matrix member event
	}

	// Convert content depending on what the message is
	let content = event.content.body // ultimate fallback
	if (event.content.format === "org.matrix.custom.html" && event.content.formatted_body) {
		let input = event.content.formatted_body
		if (event.content.msgtype === "m.emote") {
			input = `* ${displayName} ${input}`
		}

		// Note: Element's renderers on Web and Android currently collapse whitespace, like the browser does. Turndown also collapses whitespace which is good for me.
		// If later I'm using a client that doesn't collapse whitespace and I want turndown to follow suit, uncomment the following line of code, and it Just Works:
		// input = input.replace(/ /g, "&nbsp;")
		// There is also a corresponding test to uncomment, named "event2message: whitespace is retained"

		// Handling replies. We'll look up the data of the replied-to event from the Matrix homeserver.
		await (async () => {
			const repliedToEventId = event.content["m.relates_to"]?.["m.in_reply_to"].event_id
			if (!repliedToEventId) return
			const repliedToEvent = await di.api.getEvent(event.room_id, repliedToEventId)
			if (!repliedToEvent) return
			const row = db.prepare("SELECT channel_id, message_id FROM event_message WHERE event_id = ? ORDER BY part").get(repliedToEventId)
			if (row) {
				replyLine = `<:L1:1144820033948762203><:L2:1144820084079087647>https://discord.com/channels/${guild.id}/${row.channel_id}/${row.message_id} `
			} else {
				replyLine = `<:L1:1144820033948762203><:L2:1144820084079087647>`
			}
			const sender = repliedToEvent.sender
			const senderName = sender.match(/@([^:]*)/)?.[1] || sender
			const authorID = db.prepare("SELECT discord_id FROM sim WHERE mxid = ?").pluck().get(repliedToEvent.sender)
			if (authorID) {
				replyLine += `<@${authorID}>: `
			} else {
				replyLine += `Ⓜ️**${senderName}**: `
			}
			const repliedToContent = repliedToEvent.content.formatted_body || repliedToEvent.content.body
			const contentPreviewChunks = chunk(repliedToContent.replace(/.*<\/mx-reply>/, "").replace(/(?:\n|<br>)+/g, " ").replace(/<[^>]+>/g, ""), 24)
			const contentPreview = contentPreviewChunks.length > 1 ? contentPreviewChunks[0] + "..." : contentPreviewChunks[0]
			replyLine += contentPreview + "\n"
		})()

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

		// @ts-ignore
		content = turndownService.turndown(input)

		// It's optimised for commonmark, we need to replace the space-space-newline with just newline
		content = content.replace(/  \n/g, "\n")
	} else {
		// Looks like we're using the plaintext body!
		// Markdown needs to be escaped
		content = content.replace(/([*_~`#])/g, `\\$1`)
	}

	content = replyLine + content

	// Split into 2000 character chunks
	const chunks = chunk(content, 2000)
	messages = messages.concat(chunks.map(content => ({
		content,
		username: displayName,
		avatar_url: avatarURL
	})))

	return messages
}

module.exports.eventToMessage = eventToMessage
