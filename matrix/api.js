// @ts-check

const Ty = require("../types")
const assert = require("assert")

const passthrough = require("../passthrough")
const { discord, sync, db } = passthrough
/** @type {import("./mreq")} */
const mreq = sync.require("./mreq")
/** @type {import("./file")} */
const file = sync.require("./file")
/** @type {import("./txnid")} */
const makeTxnId = sync.require("./txnid")

/**
 * @param {string} p endpoint to access
 * @param {string?} [mxid] optional: user to act as, for the ?user_id parameter
 * @param {{[x: string]: any}} [otherParams] optional: any other query parameters to add
 * @returns {string} the new endpoint
 */
function path(p, mxid, otherParams = {}) {
	if (!mxid) return p
	const u = new URL(p, "http://localhost")
	u.searchParams.set("user_id", mxid)
	for (const entry of Object.entries(otherParams)) {
		if (entry[1] != undefined) {
			u.searchParams.set(entry[0], entry[1])
		}
	}
	return u.pathname + "?" + u.searchParams.toString()
}

/**
 * @param {string} username
 * @returns {Promise<Ty.R.Registered>}
 */
function register(username) {
	console.log(`[api] register: ${username}`)
	return mreq.mreq("POST", "/client/v3/register", {
		type: "m.login.application_service",
		username
	})
}

/**
 * @returns {Promise<string>} room ID
 */
async function createRoom(content) {
	console.log(`[api] create room:`, content)
	/** @type {Ty.R.RoomCreated} */
	const root = await mreq.mreq("POST", "/client/v3/createRoom", content)
	return root.room_id
}

/**
 * @returns {Promise<string>} room ID
 */
async function joinRoom(roomIDOrAlias, mxid) {
	/** @type {Ty.R.RoomJoined} */
	const root = await mreq.mreq("POST", path(`/client/v3/join/${roomIDOrAlias}`, mxid))
	return root.room_id
}

async function inviteToRoom(roomID, mxidToInvite, mxid) {
	await mreq.mreq("POST", path(`/client/v3/rooms/${roomID}/invite`, mxid), {
		user_id: mxidToInvite
	})
}

async function leaveRoom(roomID, mxid) {
	await mreq.mreq("POST", path(`/client/v3/rooms/${roomID}/leave`, mxid), {})
}

/**
 * @param {string} roomID
 * @param {string} eventID
 * @template T
 */
async function getEvent(roomID, eventID) {
	/** @type {Ty.Event.Outer<T>} */
	const root = await mreq.mreq("GET", `/client/v3/rooms/${roomID}/event/${eventID}`)
	return root
}

/**
 * @param {string} roomID
 * @returns {Promise<Ty.Event.BaseStateEvent[]>}
 */
function getAllState(roomID) {
	return mreq.mreq("GET", `/client/v3/rooms/${roomID}/state`)
}

/**
 * @param {string} roomID
 * @param {string} type
 * @param {string} key
 * @returns the *content* of the state event
 */
function getStateEvent(roomID, type, key) {
	return mreq.mreq("GET", `/client/v3/rooms/${roomID}/state/${type}/${key}`)
}

/**
 * "Any of the AS's users must be in the room. This API is primarily for Application Services and should be faster to respond than /members as it can be implemented more efficiently on the server."
 * @param {string} roomID
 * @returns {Promise<{joined: {[mxid: string]: Ty.R.RoomMember}}>}
 */
function getJoinedMembers(roomID) {
	return mreq.mreq("GET", `/client/v3/rooms/${roomID}/joined_members`)
}

/**
 * @param {string} roomID
 * @param {string} type
 * @param {string} stateKey
 * @param {string} [mxid]
 * @returns {Promise<string>} event ID
 */
async function sendState(roomID, type, stateKey, content, mxid) {
	console.log(`[api] state: ${roomID}: ${type}/${stateKey}`)
	assert.ok(type)
	assert.ok(typeof stateKey === "string")
	/** @type {Ty.R.EventSent} */
	// encodeURIComponent is necessary because state key can contain some special characters like / but you must encode them so they fit in a single component of the URI
	const root = await mreq.mreq("PUT", path(`/client/v3/rooms/${roomID}/state/${type}/${encodeURIComponent(stateKey)}`, mxid), content)
	return root.event_id
}

/**
 * @param {string} roomID
 * @param {string} type
 * @param {any} content
 * @param {string?} [mxid]
 * @param {number} [timestamp] timestamp of the newly created event, in unix milliseconds
 */
async function sendEvent(roomID, type, content, mxid, timestamp) {
	console.log(`[api] event ${type} to ${roomID} as ${mxid || "default sim"}`)
	/** @type {Ty.R.EventSent} */
	const root = await mreq.mreq("PUT", path(`/client/v3/rooms/${roomID}/send/${type}/${makeTxnId.makeTxnId()}`, mxid, {ts: timestamp}), content)
	return root.event_id
}

/**
 * @returns {Promise<string>} room ID
 */
async function redactEvent(roomID, eventID, mxid) {
	/** @type {Ty.R.EventRedacted} */
	const root = await mreq.mreq("PUT", path(`/client/v3/rooms/${roomID}/redact/${eventID}/${makeTxnId.makeTxnId()}`, mxid), {})
	return root.event_id
}

/**
 * @param {string} roomID
 * @param {boolean} isTyping
 * @param {string} mxid
 * @param {number} [duration] milliseconds
 */
async function sendTyping(roomID, isTyping, mxid, duration) {
	await mreq.mreq("PUT", path(`/client/v3/rooms/${roomID}/typing/${mxid}`, mxid), {
		typing: isTyping,
		duration
	})
}

async function profileSetDisplayname(mxid, displayname) {
	await mreq.mreq("PUT", path(`/client/v3/profile/${mxid}/displayname`, mxid), {
		displayname
	})
}

async function profileSetAvatarUrl(mxid, avatar_url) {
	await mreq.mreq("PUT", path(`/client/v3/profile/${mxid}/avatar_url`, mxid), {
		avatar_url
	})
}

/**
 * Set a user's power level within a room.
 * @param {string} roomID
 * @param {string} mxid
 * @param {number} power
 */
async function setUserPower(roomID, mxid, power) {
	assert(roomID[0] === "!")
	assert(mxid[0] === "@")
	// Yes there's no shortcut https://github.com/matrix-org/matrix-appservice-bridge/blob/2334b0bae28a285a767fe7244dad59f5a5963037/src/components/intent.ts#L352
	const powerLevels = await getStateEvent(roomID, "m.room.power_levels", "")
	powerLevels.users = powerLevels.users || {}
	if (power != null) {
		powerLevels.users[mxid] = power
	} else {
		delete powerLevels.users[mxid]
	}
	await sendState(roomID, "m.room.power_levels", "", powerLevels)
	return powerLevels
}

module.exports.path = path
module.exports.register = register
module.exports.createRoom = createRoom
module.exports.joinRoom = joinRoom
module.exports.inviteToRoom = inviteToRoom
module.exports.leaveRoom = leaveRoom
module.exports.getEvent = getEvent
module.exports.getAllState = getAllState
module.exports.getStateEvent = getStateEvent
module.exports.getJoinedMembers = getJoinedMembers
module.exports.sendState = sendState
module.exports.sendEvent = sendEvent
module.exports.redactEvent = redactEvent
module.exports.sendTyping = sendTyping
module.exports.profileSetDisplayname = profileSetDisplayname
module.exports.profileSetAvatarUrl = profileSetAvatarUrl
module.exports.setUserPower = setUserPower
