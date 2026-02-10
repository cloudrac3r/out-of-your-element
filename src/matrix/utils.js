// @ts-check

const assert = require("assert").strict
const Ty = require("../types")
const {tag} = require("@cloudrac3r/html-template-tag")
const passthrough = require("../passthrough")
const {db} = passthrough

const {reg} = require("./read-registration")
const userRegex = reg.namespaces.users.map(u => new RegExp(u.regex))

/** @type {import("xxhash-wasm").XXHashAPI} */ // @ts-ignore
let hasher = null
// @ts-ignore
require("xxhash-wasm")().then(h => hasher = h)

const bot = `@${reg.sender_localpart}:${reg.ooye.server_name}`

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

class MatrixStringBuilderStack {
	constructor() {
		this.stack = [new MatrixStringBuilder()]
	}

	get msb() {
		return this.stack[0]
	}

	bump() {
		this.stack.unshift(new MatrixStringBuilder())
	}

	shift() {
		const msb = this.stack.shift()
		assert(msb)
		return msb
	}
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
			if (formattedBody == undefined) formattedBody = tag`${body}`
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
			if (formattedBody == undefined) formattedBody = tag`${body}`
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
			if (formattedBody == undefined) formattedBody = tag`${body}`
			if (this.body.length && this.body.slice(-1) !== "\n") this.body += "\n\n"
			this.body += body
			const match = formattedBody.match(/^<([a-zA-Z]+[a-zA-Z0-9]*)/)
			if (!match || !BLOCK_ELEMENTS.includes(match[1].toUpperCase())) formattedBody = `<p>${formattedBody}</p>`
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
 * @param {{[K in "getStateEvent" | "getStateEventOuter" | "getJoinedMembers"]: import("./api")[K]} | {getEffectivePower: (roomID: string, mxids: string[], api: any) => Promise<{powers: Record<string, number>, allCreators: string[], tombstone: number, roomCreate: Ty.Event.StateOuter<Ty.Event.M_Room_Create>, powerLevels: Ty.Event.M_Power_Levels}>, getJoinedMembers: import("./api")["getJoinedMembers"]}} api
 */
async function getViaServers(roomID, api) {
	const candidates = []
	const {joined} = await api.getJoinedMembers(roomID)
	// Candidate 0: The bot's own server name
	candidates.push(reg.ooye.server_name)
	// Candidate 1: Highest joined non-sim non-bot power level user in the room
	// https://github.com/matrix-org/matrix-react-sdk/blob/552c65db98b59406fb49562e537a2721c8505517/src/utils/permalinks/Permalinks.ts#L172
	/* c8 ignore next */
	const call = "getEffectivePower" in api ? api.getEffectivePower(roomID, [bot], api) : getEffectivePower(roomID, [bot], api)
	const {allCreators, powerLevels} = await call
	powerLevels.users ??= {}
	const sorted = allCreators.concat(Object.entries(powerLevels.users).sort((a, b) => b[1] - a[1]).map(([mxid]) => mxid)) // Highest...
	for (const mxid of sorted) {
		if (!(mxid in joined)) continue // joined...
		if (userRegex.some(r => mxid.match(r))) continue // non-sim non-bot...
		const match = mxid.match(/:(.*)/)
		assert(match)
		/* c8 ignore next - should be already covered by the userRegex test, but let's be explicit */
		if (candidates.includes(match[1])) continue // from a different server
		candidates.push(match[1])
		break
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
 * @param {{[K in "getStateEvent" | "getStateEventOuter" | "getJoinedMembers"]: import("./api")[K]}} api
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

function generatePermittedMediaHash(mxc) {
	assert(hasher, "xxhash is not ready yet")
	const mediaParts = mxc?.match(/^mxc:\/\/([^/]+)\/(\w+)$/)
	if (!mediaParts) return undefined

	const serverAndMediaID = `${mediaParts[1]}/${mediaParts[2]}`
	const unsignedHash = hasher.h64(serverAndMediaID)
	const signedHash = unsignedHash - 0x8000000000000000n // shifting down to signed 64-bit range
	db.prepare("INSERT OR IGNORE INTO media_proxy (permitted_hash) VALUES (?)").run(signedHash)

	return serverAndMediaID
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
 * @param {string | null | undefined} mxc
 * @returns {string | undefined}
 */
function getPublicUrlForMxc(mxc) {
	const serverAndMediaID = makeMxcPublic(mxc)
	if(!serverAndMediaID) return undefined
	return `${reg.ooye.bridge_origin}/download/matrix/${serverAndMediaID}`
}

/**
 * @param {string | null | undefined} mxc
 * @returns {string | undefined} mxc URL with protocol stripped, e.g. "cadence.moe/abcdef1234"
 */
function makeMxcPublic(mxc) {
	assert(hasher, "xxhash is not ready yet")
	const mediaParts = mxc?.match(/^mxc:\/\/([^/]+)\/(\w+)$/)
	if (!mediaParts) return undefined

	const serverAndMediaID = `${mediaParts[1]}/${mediaParts[2]}`
	const unsignedHash = hasher.h64(serverAndMediaID)
	const signedHash = unsignedHash - 0x8000000000000000n // shifting down to signed 64-bit range
	db.prepare("INSERT OR IGNORE INTO media_proxy (permitted_hash) VALUES (?)").run(signedHash)

	return serverAndMediaID
}

/**
 * @param {string} roomVersionString
 * @param {number} desiredVersion
 */
function roomHasAtLeastVersion(roomVersionString, desiredVersion) {
	/*
		I hate this.
		The spec instructs me to compare room versions ordinally, for example, "In room versions 12 and higher..."
		So if the real room version is 13, this should pass the check.
		However, the spec also says "room versions are not intended to be parsed and should be treated as opaque identifiers", "due to versions not being ordered or hierarchical".
		So versions are unordered and opaque and you can't parse them, but you're still expected to parse them to a number and compare them to another number to measure if it's "12 or higher"?
		Theoretically MSC3244 would clean this up, but that isn't happening since Element removed support for MSC3244: https://github.com/element-hq/element-web/commit/644b8415912afb9c5eed54859a444a2ee7224117
		Element replaced it with the following function:
	*/

	// Assumption: all unstable room versions don't support the feature. Calling code can check for unstable
	// room versions explicitly if it wants to. The spec reserves [0-9] and `.` for its room versions.
	if (!roomVersionString.match(/^[\d.]+$/)) {
		return false;
	}

	// Element dev note: While the spec says room versions are not linear, we can make reasonable assumptions
	// until the room versions prove themselves to be non-linear in the spec. We should see this coming
	// from a mile away and can course-correct this function if needed.
	return Number(roomVersionString) >= Number(desiredVersion);
}

/**
 * Starting in room version 12, creators may not be specified in power levels users.
 * Modifies the input power levels.
 * @param {Ty.Event.StateOuter<Ty.Event.M_Room_Create>} roomCreateOuter
 * @param {Ty.Event.M_Power_Levels} powerLevels
 */
function removeCreatorsFromPowerLevels(roomCreateOuter, powerLevels) {
	assert(roomCreateOuter.sender)
	if (roomHasAtLeastVersion(roomCreateOuter.content.room_version, 12) && powerLevels.users) {
		for (const creator of (roomCreateOuter.content.additional_creators ?? []).concat(roomCreateOuter.sender)) {
			delete powerLevels.users[creator]
		}
	}
	return powerLevels
}

/**
 * @template {string} T
 * @param {string} roomID
 * @param {T[]} mxids
 * @param {{[K in "getStateEvent" | "getStateEventOuter"]: import("./api")[K]}} api
 * @returns {Promise<{powers: Record<T, number>, allCreators: string[], tombstone: number, roomCreate: Ty.Event.StateOuter<Ty.Event.M_Room_Create>, powerLevels: Ty.Event.M_Power_Levels}>}
 */
async function getEffectivePower(roomID, mxids, api) {
	/** @type {[Ty.Event.StateOuter<Ty.Event.M_Room_Create>, Ty.Event.M_Power_Levels]} */
	const [roomCreate, powerLevels] = await Promise.all([
		api.getStateEventOuter(roomID, "m.room.create", ""),
		api.getStateEvent(roomID, "m.room.power_levels", "")
	])
	const allCreators =
		( roomHasAtLeastVersion(roomCreate.content.room_version, 12) ? (roomCreate.content.additional_creators ?? []).concat(roomCreate.sender)
		: [])
	const tombstone =
		( roomHasAtLeastVersion(roomCreate.content.room_version, 12) ? powerLevels.events?.["m.room.tombstone"] ?? 150
		: powerLevels.events?.["m.room.tombstone"] ?? powerLevels.state_default ?? 50)
	/** @type {Record<T, number>} */ // @ts-ignore
	const powers = {}
	for (const mxid of mxids) {
		powers[mxid] =
			( roomHasAtLeastVersion(roomCreate.content.room_version, 12) && allCreators.includes(mxid) ? Infinity
			: powerLevels.users?.[mxid]
			?? powerLevels.users_default
			?? 0)
	}
	return {powers, allCreators, tombstone, roomCreate, powerLevels}
}

/**
 * Set a user's power level within a room.
 * @param {string} roomID
 * @param {string} mxid
 * @param {number} newPower
 * @param {{[K in "getStateEvent" | "getStateEventOuter" | "sendState"]: import("./api")[K]}} api
 */
async function setUserPower(roomID, mxid, newPower, api) {
	assert(roomID[0] === "!")
	assert(mxid[0] === "@")
	// Yes there's no shortcut https://github.com/matrix-org/matrix-appservice-bridge/blob/2334b0bae28a285a767fe7244dad59f5a5963037/src/components/intent.ts#L352
	const {powerLevels, powers: {[mxid]: oldPowerLevel, [bot]: botPowerLevel}} = await getEffectivePower(roomID, [mxid, bot], api)

	// Check if it has really changed to avoid sending a useless state event
	if (oldPowerLevel === newPower) return

	// Bridge bot can't demote equal power users, so need to decide which user will send the event
	const eventSender = oldPowerLevel >= botPowerLevel ? mxid : undefined

	// Update the event content
	powerLevels.users ??= {}
	if (newPower == null || newPower === (powerLevels.users_default ?? 0)) {
		delete powerLevels.users[mxid]
	} else {
		powerLevels.users[mxid] = newPower
	}

	await api.sendState(roomID, "m.room.power_levels", "", powerLevels, eventSender)
}

/**
 * Set a user's power level for a whole room hierarchy.
 * @param {string} spaceID
 * @param {string} mxid
 * @param {number} power
 * @param {{[K in "getStateEvent" | "getStateEventOuter" | "sendState" | "generateFullHierarchy"]: import("./api")[K]}} api
 */
async function setUserPowerCascade(spaceID, mxid, power, api) {
	assert(spaceID[0] === "!")
	assert(mxid[0] === "@")
	let seenSpace = false
	for await (const room of api.generateFullHierarchy(spaceID)) {
		if (room.room_id === spaceID) seenSpace = true
		await setUserPower(room.room_id, mxid, power, api)
	}
	if (!seenSpace) {
		await setUserPower(spaceID, mxid, power, api)
	}
}

module.exports.bot = bot
module.exports.BLOCK_ELEMENTS = BLOCK_ELEMENTS
module.exports.eventSenderIsFromDiscord = eventSenderIsFromDiscord
module.exports.makeMxcPublic = makeMxcPublic
module.exports.getPublicUrlForMxc = getPublicUrlForMxc
module.exports.getEventIDHash = getEventIDHash
module.exports.MatrixStringBuilder = MatrixStringBuilder
module.exports.MatrixStringBuilderStack = MatrixStringBuilderStack
module.exports.getViaServers = getViaServers
module.exports.getViaServersQuery = getViaServersQuery
module.exports.roomHasAtLeastVersion = roomHasAtLeastVersion
module.exports.removeCreatorsFromPowerLevels = removeCreatorsFromPowerLevels
module.exports.getEffectivePower = getEffectivePower
module.exports.setUserPower = setUserPower
module.exports.setUserPowerCascade = setUserPowerCascade
