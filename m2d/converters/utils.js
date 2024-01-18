// @ts-check

const reg = require("../../matrix/read-registration")
const userRegex = reg.namespaces.users.map(u => new RegExp(u.regex))
const assert = require("assert").strict
/** @type {import("xxhash-wasm").XXHashAPI} */ // @ts-ignore
let hasher = null
// @ts-ignore
require("xxhash-wasm")().then(h => hasher = h)

const BLOCK_ELEMENTS = [
	"ADDRESS", "ARTICLE", "ASIDE", "AUDIO", "BLOCKQUOTE", "BODY", "CANVAS",
	"CENTER", "DD", "DETAILS", "DIR", "DIV", "DL", "DT", "FIELDSET", "FIGCAPTION", "FIGURE",
	"FOOTER", "FORM", "FRAMESET", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER",
	"HGROUP", "HR", "HTML", "ISINDEX", "LI", "MAIN", "MENU", "NAV", "NOFRAMES",
	"NOSCRIPT", "OL", "OUTPUT", "P", "PRE", "SECTION", "SUMMARY", "TABLE", "TBODY", "TD",
	"TFOOT", "TH", "THEAD", "TR", "UL"
]
const NEWLINE_ELEMENTS = BLOCK_ELEMENTS.concat(["BR"])

/**
 * Determine whether an event is the bridged representation of a discord message.
 * Such messages shouldn't be bridged again.
 * @param {string} sender
 */
function eventSenderIsFromDiscord(sender) {
	// If it's from a user in the bridge's namespace, then it originated from discord
	// This includes messages sent by the appservice's bot user, because that is what's used for webhooks
	// TODO: It would be nice if bridge system messages wouldn't trigger this check and could be bridged from matrix to discord, while webhook reflections would remain ignored...
	// TODO that only applies to the above todo: But you'd have to watch out for the /icon command, where the bridge bot would set the room avatar, and that shouldn't be reflected into the room a second time.
	if (userRegex.some(x => sender.match(x))) {
		return true
	}

	return false
}

/**
 * @param {string} mxc
 * @returns {string?}
 */
function getPublicUrlForMxc(mxc) {
	const avatarURLParts = mxc?.match(/^mxc:\/\/([^/]+)\/(\w+)$/)
	if (avatarURLParts) return `${reg.ooye.server_origin}/_matrix/media/r0/download/${avatarURLParts[1]}/${avatarURLParts[2]}`
	else return null
}

/**
 * Event IDs are really big and have more entropy than we need.
 * If we want to store the event ID in the database, we can store a more compact version by hashing it with this.
 * I choose a 64-bit non-cryptographic hash as only a 32-bit hash will see birthday collisions unreasonably frequently: https://en.wikipedia.org/wiki/Birthday_attack#Mathematics
 * xxhash outputs an unsigned 64-bit integer.
 * Converting to a signed 64-bit integer with no bit loss so that it can be stored in an SQLite integer field as-is: https://www.sqlite.org/fileformat2.html#record_format
 * This should give very efficient storage with sufficient entropy.
 * @param {string} eventID
 */
function getEventIDHash(eventID) {
	assert(hasher, "xxhash is not ready yet")
	if (eventID[0] === "$" && eventID.length >= 13) {
		eventID = eventID.slice(1) // increase entropy per character to potentially help xxhash
	}
	const unsignedHash = hasher.h64(eventID)
	const signedHash = unsignedHash - 0x8000000000000000n // shifting down to signed 64-bit range
	return signedHash
}

class MatrixStringBuilder {
	constructor() {
		this.body = ""
		this.formattedBody = ""
	}

	/**
	 * @param {string} body
	 * @param {string} [formattedBody]
	 * @param {any} [condition]
	 */
	add(body, formattedBody, condition = true) {
		if (condition) {
			if (formattedBody == undefined) formattedBody = body
			this.body += body
			this.formattedBody += formattedBody
		}
		return this
	}

	/**
	 * @param {string} body
	 * @param {string} [formattedBody]
	 * @param {any} [condition]
	 */
	addLine(body, formattedBody, condition = true) {
		if (condition) {
			if (formattedBody == undefined) formattedBody = body
			if (this.body.length && this.body.slice(-1) !== "\n") this.body += "\n"
			this.body += body
			const match = this.formattedBody.match(/<\/?([a-zA-Z]+[a-zA-Z0-9]*)[^>]*>\s*$/)
			if (this.formattedBody.length && (!match || !NEWLINE_ELEMENTS.includes(match[1].toUpperCase()))) this.formattedBody += "<br>"
			this.formattedBody += formattedBody
		}
		return this
	}

	/**
	 * @param {string} body
	 * @param {string} [formattedBody]
	 * @param {any} [condition]
	 */
	addParagraph(body, formattedBody, condition = true) {
		if (condition) {
			if (formattedBody == undefined) formattedBody = body
			if (this.body.length && this.body.slice(-1) !== "\n") this.body += "\n\n"
			this.body += body
			formattedBody = `<p>${formattedBody}</p>`
			this.formattedBody += formattedBody
		}
		return this
	}

	get() {
		return {
			msgtype: "m.text",
			body: this.body,
			format: "org.matrix.custom.html",
			formatted_body: this.formattedBody
		}
	}
}

module.exports.BLOCK_ELEMENTS = BLOCK_ELEMENTS
module.exports.eventSenderIsFromDiscord = eventSenderIsFromDiscord
module.exports.getPublicUrlForMxc = getPublicUrlForMxc
module.exports.getEventIDHash = getEventIDHash
module.exports.MatrixStringBuilder = MatrixStringBuilder
