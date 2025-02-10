// @ts-check

const assert = require("assert").strict

const passthrough = require("../../passthrough")
const {db} = passthrough

const {reg} = require("../../matrix/read-registration")
const userRegex = reg.namespaces.users.map(u => new RegExp(u.regex))

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
	// This could include messages sent by the appservice's bot user, because that is what's used for webhooks
	if (userRegex.some(x => sender.match(x))) {
		return true
	}

	return false
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

/**
 * Context: Room IDs are not routable on their own. Room permalinks need a list of servers to try. The client is responsible for coming up with a list of servers.
 * ASSUMPTION 1: The bridge bot is a member of the target room and can therefore access its power levels and member list for calculation.
 * ASSUMPTION 2: Because the bridge bot is a member of the target room, the target room is bridged.
 * https://spec.matrix.org/v1.9/appendices/#routing
 * https://gitdab.com/cadence/out-of-your-element/issues/11
 * @param {string} roomID
 * @param {{[K in "getStateEvent" | "getJoinedMembers"]: import("../../matrix/api")[K]}} api
 */
async function getViaServers(roomID, api) {
	const candidates = []
	const {joined} = await api.getJoinedMembers(roomID)
	// Candidate 0: The bot's own server name
	candidates.push(reg.ooye.server_name)
	// Candidate 1: Highest joined non-sim non-bot power level user in the room
	// https://github.com/matrix-org/matrix-react-sdk/blob/552c65db98b59406fb49562e537a2721c8505517/src/utils/permalinks/Permalinks.ts#L172
	try {
		/** @type {{users?: {[mxid: string]: number}}} */
		const powerLevels = await api.getStateEvent(roomID, "m.room.power_levels", "")
		if (powerLevels.users) {
			const sorted = Object.entries(powerLevels.users).sort((a, b) => b[1] - a[1]) // Highest...
			for (const power of sorted) {
				const mxid = power[0]
				if (!(mxid in joined)) continue // joined...
				if (userRegex.some(r => mxid.match(r))) continue // non-sim non-bot...
				const match = mxid.match(/:(.*)/)
				assert(match)
				if (!candidates.includes(match[1])) {
					candidates.push(match[1])
					break
				}
			}
		}
	} catch (e) {
		// power levels event not found
	}
	// Candidates 2-3: Most popular servers in the room
	/** @type {Map<string, number>} */
	const servers = new Map()
	// We can get the most popular servers if we know the members, so let's process those...
	Object.keys(joined)
		.filter(mxid => !mxid.startsWith("@_")) // Quick check
		.filter(mxid => !userRegex.some(r => mxid.match(r))) // Full check
		.slice(0, 1000) // Just sample the first thousand real members
		.map(mxid => {
			const match = mxid.match(/:(.*)/)
			assert(match)
			return match[1]
		})
		.filter(server => !server.match(/([a-f0-9:]+:+)+[a-f0-9]+/)) // No IPv6 servers
		.filter(server => !server.match(/[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/)) // No IPv4 servers
		// I don't care enough to check ACLs
		.forEach(server => {
			const existing = servers.get(server)
			if (!existing) servers.set(server, 1)
			else servers.set(server, existing + 1)
		})
	const serverList = [...servers.entries()].sort((a, b) => b[1] - a[1])
	for (const server of serverList) {
		if (!candidates.includes(server[0])) {
			candidates.push(server[0])
			if (candidates.length >= 4) break // Can have at most 4 candidate via servers
		}
	}
	return candidates
}

/**
 * Context: Room IDs are not routable on their own. Room permalinks need a list of servers to try. The client is responsible for coming up with a list of servers.
 * ASSUMPTION 1: The bridge bot is a member of the target room and can therefore access its power levels and member list for calculation.
 * ASSUMPTION 2: Because the bridge bot is a member of the target room, the target room is bridged.
 * https://spec.matrix.org/v1.9/appendices/#routing
 * https://gitdab.com/cadence/out-of-your-element/issues/11
 * @param {string} roomID
 * @param {{[K in "getStateEvent" | "getJoinedMembers"]: import("../../matrix/api")[K]}} api
 * @returns {Promise<URLSearchParams>}
 */
async function getViaServersQuery(roomID, api) {
	const list = await getViaServers(roomID, api)
	const qs = new URLSearchParams()
	for (const server of list) {
		qs.append("via", server)
	}
	return qs
}

/**
 * Since the introduction of authenticated media, this can no longer just be the /_matrix/media/r0/download URL
 * because Discord and Discord users cannot use those URLs. Media now has to be proxied through the bridge.
 * To avoid the bridge acting as a proxy for *any* media, there is a list of permitted media stored in the database.
 * (The other approach would be signing the URLs with a MAC (or similar) and adding the signature, but I'm not a
 * cryptographer, so I don't want to.) To reduce database disk space usage, instead of storing each permitted URL,
 * we just store its xxhash as a signed (as in +/-, not signature) 64-bit integer, which fits in an SQLite integer field.
 * @see https://matrix.org/blog/2024/06/26/sunsetting-unauthenticated-media/ background
 * @see https://matrix.org/blog/2024/06/20/matrix-v1.11-release/ implementation details
 * @see https://www.sqlite.org/fileformat2.html#record_format SQLite integer field size
 * @param {string} mxc
 * @returns {string | undefined}
 */
function getPublicUrlForMxc(mxc) {
	assert(hasher, "xxhash is not ready yet")
	const mediaParts = mxc?.match(/^mxc:\/\/([^/]+)\/(\w+)$/)
	if (!mediaParts) return undefined

	const serverAndMediaID = `${mediaParts[1]}/${mediaParts[2]}`
	const unsignedHash = hasher.h64(serverAndMediaID)
	const signedHash = unsignedHash - 0x8000000000000000n // shifting down to signed 64-bit range
	db.prepare("INSERT OR IGNORE INTO media_proxy (permitted_hash) VALUES (?)").run(signedHash)

	return `${reg.ooye.bridge_origin}/download/matrix/${serverAndMediaID}`
}

module.exports.BLOCK_ELEMENTS = BLOCK_ELEMENTS
module.exports.eventSenderIsFromDiscord = eventSenderIsFromDiscord
module.exports.getPublicUrlForMxc = getPublicUrlForMxc
module.exports.getEventIDHash = getEventIDHash
module.exports.MatrixStringBuilder = MatrixStringBuilder
module.exports.getViaServers = getViaServers
module.exports.getViaServersQuery = getViaServersQuery
