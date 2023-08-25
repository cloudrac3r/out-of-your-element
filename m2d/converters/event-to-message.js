// @ts-check

const Ty = require("../../types")
const DiscordTypes = require("discord-api-types/v10")
const chunk = require("chunk-text")
const TurndownService = require("turndown")

const passthrough = require("../../passthrough")
const { sync, db, discord } = passthrough
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")

// https://github.com/mixmark-io/turndown/blob/97e4535ca76bb2e70d9caa2aa4d4686956b06d44/src/utilities.js#L26C28-L33C2
const BLOCK_ELEMENTS = [
	"ADDRESS", "ARTICLE", "ASIDE", "AUDIO", "BLOCKQUOTE", "BODY", "CANVAS",
	"CENTER", "DD", "DETAILS", "DIR", "DIV", "DL", "DT", "FIELDSET", "FIGCAPTION", "FIGURE",
	"FOOTER", "FORM", "FRAMESET", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER",
	"HGROUP", "HR", "HTML", "ISINDEX", "LI", "MAIN", "MENU", "NAV", "NOFRAMES",
	"NOSCRIPT", "OL", "OUTPUT", "P", "PRE", "SECTION", "SUMMARY", "TABLE", "TBODY", "TD",
	"TFOOT", "TH", "THEAD", "TR", "UL"
]

const turndownService = new TurndownService({
	hr: "----"
})

turndownService.addRule("strikethrough", {
	filter: ["del", "s", "strike"],
	replacement: function (content) {
		return "~~" + content + "~~"
	}
})

/**
 * @param {Ty.Event.Outer<Ty.Event.M_Room_Message>} event
 */
function eventToMessage(event) {
	/** @type {(DiscordTypes.RESTPostAPIWebhookWithTokenJSONBody & {files?: {name: string, file: Buffer}[]})[]} */
	let messages = []

	let displayName = event.sender
	let avatarURL = undefined
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

		// The matrix spec hasn't decided whether \n counts as a newline or not, but I'm going to count it, because if it's in the data it's there for a reason.
		// But I should not count it if it's between block elements.
		input = input.replace(/(<\/?([^ >]+)[^>]*>)?\n(<\/?([^ >]+)[^>]*>)?/g, (whole, beforeContext, beforeTag, afterContext, afterTag) => {
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
	}

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
