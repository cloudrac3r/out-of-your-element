// @ts-check

const Ty = require("../types")
const assert = require("assert").strict
const streamWeb = require("stream/web")

const passthrough = require("../passthrough")
const {sync} = passthrough
/** @type {import("./mreq")} */
const mreq = sync.require("./mreq")
/** @type {import("./txnid")} */
const makeTxnId = sync.require("./txnid")
const {reg} = require("./read-registration.js")

/**
 * @param {string} p endpoint to access
 * @param {string?} [mxid] optional: user to act as, for the ?user_id parameter
 * @param {{[x: string]: any}} [otherParams] optional: any other query parameters to add
 * @returns {string} the new endpoint
 */
function path(p, mxid, otherParams = {}) {
	const u = new URL(p, "http://localhost")
	if (mxid) u.searchParams.set("user_id", mxid)
	for (const entry of Object.entries(otherParams)) {
		if (Array.isArray(entry[1])) {
			for (const element of entry[1]) {
				u.searchParams.append(entry[0], element)
			}
		} else if (entry[1] != undefined) {
			u.searchParams.set(entry[0], entry[1])
		}
	}
	let result = u.pathname
	const str = u.searchParams.toString()
	if (str) result += "?" + str
	return result
}

/**
 * @param {string} username
 */
async function register(username) {
	console.log(`[api] register: ${username}`)
	try {
		await mreq.mreq("POST", "/client/v3/register", {
			type: "m.login.application_service",
			username
		})
	} catch (e) {
		if (e.errcode === "M_USER_IN_USE" || e.data?.error === "Internal server error") {
			// "Internal server error" is the only OK error because older versions of Synapse say this if you try to register the same username twice.
		} else {
			throw e
		}
	}
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
 * @param {string} roomIDOrAlias
 * @param {string?} [mxid]
 * @param {string[]?} [via]
 * @returns {Promise<string>} room ID
 */
async function joinRoom(roomIDOrAlias, mxid, via) {
	/** @type {Ty.R.RoomJoined} */
	const root = await mreq.mreq("POST", path(`/client/v3/join/${roomIDOrAlias}`, mxid, {via}), {})
	return root.room_id
}

async function inviteToRoom(roomID, mxidToInvite, mxid) {
	await mreq.mreq("POST", path(`/client/v3/rooms/${roomID}/invite`, mxid), {
		user_id: mxidToInvite
	})
}

async function leaveRoom(roomID, mxid) {
	console.log(`[api] leave: ${roomID}: ${mxid}`)
	await mreq.mreq("POST", path(`/client/v3/rooms/${roomID}/leave`, mxid), {})
}

/**
 * @param {string} roomID
 * @param {string} reason
 * @param {string} [mxid]
 */
async function leaveRoomWithReason(roomID, reason, mxid) {
	console.log(`[api] leave: ${roomID}: ${mxid}, because ${reason}`)
	await mreq.mreq("POST", path(`/client/v3/rooms/${roomID}/leave`, mxid), {reason})
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
 * @param {number} ts unix silliseconds
 */
async function getEventForTimestamp(roomID, ts) {
	/** @type {{event_id: string, origin_server_ts: number}} */
	const root = await mreq.mreq("GET", path(`/client/v1/rooms/${roomID}/timestamp_to_event`, null, {ts}))
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
 * @returns {Promise<{joined: {[mxid: string]: {avatar_url: string?, display_name: string?}}}>}
 */
function getJoinedMembers(roomID) {
	return mreq.mreq("GET", `/client/v3/rooms/${roomID}/joined_members`)
}

/**
 * "Get the list of members for this room." This includes joined, invited, knocked, left, and banned members unless a filter is provided.
 * The endpoint also supports `at` and `not_membership` URL parameters, but they are not exposed in this wrapper yet.
 * @param {string} roomID
 * @param {"join" | "invite" | "knock" | "leave" | "ban"} [membership] The kind of membership to filter for. Only one choice allowed.
 * @returns {Promise<{chunk: Ty.Event.Outer<Ty.Event.M_Room_Member>[]}>}
 */
function getMembers(roomID, membership) {
	return mreq.mreq("GET", `/client/v3/rooms/${roomID}/members`, undefined, {membership})
}

/**
 * @param {string} roomID
 * @param {{from?: string, limit?: any}} pagination
 * @returns {Promise<Ty.HierarchyPagination<Ty.R.Hierarchy>>}
 */
function getHierarchy(roomID, pagination) {
	let path = `/client/v1/rooms/${roomID}/hierarchy`
	if (!pagination.from) delete pagination.from
	if (!pagination.limit) pagination.limit = 50
	path += `?${new URLSearchParams(pagination)}`
	return mreq.mreq("GET", path)
}

/**
 * Like `getHierarchy` but collects all pages for you.
 * @param {string} roomID
 */
async function getFullHierarchy(roomID) {
	/** @type {Ty.R.Hierarchy[]} */
	let rooms = []
	/** @type {string | undefined} */
	let nextBatch = undefined
	do {
		/** @type {Ty.HierarchyPagination<Ty.R.Hierarchy>} */
		const res = await getHierarchy(roomID, {from: nextBatch})
		rooms.push(...res.rooms)
		nextBatch = res.next_batch
	} while (nextBatch)
	return rooms
}

/**
 * Like `getFullHierarchy` but reveals a page at a time through an async iterator.
 * @param {string} roomID
 */
async function* generateFullHierarchy(roomID) {
	/** @type {string | undefined} */
	let nextBatch = undefined
	do {
		/** @type {Ty.HierarchyPagination<Ty.R.Hierarchy>} */
		const res = await getHierarchy(roomID, {from: nextBatch})
		for (const room of res.rooms) {
			yield room
		}
		nextBatch = res.next_batch
	} while (nextBatch)
}

/**
 * @param {string} roomID
 * @param {string} eventID
 * @param {{from?: string, limit?: any}} pagination
 * @param {string?} [relType]
 * @returns {Promise<Ty.Pagination<Ty.Event.Outer<any>>>}
 */
function getRelations(roomID, eventID, pagination, relType) {
	let path = `/client/v1/rooms/${roomID}/relations/${eventID}`
	if (relType) path += `/${relType}`
	if (!pagination.from) delete pagination.from
	if (!pagination.limit) pagination.limit = 50 // get a little more consistency between homeservers
	path += `?${new URLSearchParams(pagination)}`
	return mreq.mreq("GET", path)
}

/**
 * Like `getRelations` but collects and filters all pages for you.
 * @param {string} roomID
 * @param {string} eventID
 * @param {string?} [relType] type of relations to filter, e.g. "m.annotation" for reactions
 */
async function getFullRelations(roomID, eventID, relType) {
	/** @type {Ty.Event.Outer<Ty.Event.M_Reaction>[]} */
	let reactions = []
	/** @type {string | undefined} */
	let nextBatch = undefined
	do {
		/** @type {Ty.Pagination<Ty.Event.Outer<Ty.Event.M_Reaction>>} */
		const res = await getRelations(roomID, eventID, {from: nextBatch}, relType)
		reactions = reactions.concat(res.chunk)
		nextBatch = res.next_batch
	} while (nextBatch)
	return reactions
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
	if (!["m.room.message", "m.reaction", "m.sticker"].includes(type)) {
		console.log(`[api] event ${type} to ${roomID} as ${mxid || "default sim"}`)
	}
	/** @type {Ty.R.EventSent} */
	const root = await mreq.mreq("PUT", path(`/client/v3/rooms/${roomID}/send/${type}/${makeTxnId.makeTxnId()}`, mxid, {ts: timestamp}), content)
	return root.event_id
}

/**
 * @param {string} roomID
 * @param {string} eventID
 * @param {string?} [mxid]
 * @returns {Promise<string>} event ID
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
		timeout: duration
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
 * @param {number} newPower
 */
async function setUserPower(roomID, mxid, newPower) {
	assert(roomID[0] === "!")
	assert(mxid[0] === "@")
	// Yes there's no shortcut https://github.com/matrix-org/matrix-appservice-bridge/blob/2334b0bae28a285a767fe7244dad59f5a5963037/src/components/intent.ts#L352
	const power = await getStateEvent(roomID, "m.room.power_levels", "")
	power.users = power.users || {}

	// Check if it has really changed to avoid sending a useless state event
	// (Can't diff kstate here because of (a) circular imports (b) kstate has special behaviour diffing power levels)
	const oldPowerLevel = power.users?.[mxid] ?? power.users_default ?? 0
	if (oldPowerLevel === newPower) return

	// Bridge bot can't demote equal power users, so need to decide which user will send the event
	const botPowerLevel = power.users?.[`@${reg.sender_localpart}:${reg.ooye.server_name}`] ?? power.users_default ?? 0
	const eventSender = oldPowerLevel >= botPowerLevel ? mxid : undefined

	// Update the event content
	if (newPower == null || newPower === (power.users_default ?? 0)) {
		delete power.users[mxid]
	} else {
		power.users[mxid] = newPower
	}

	await sendState(roomID, "m.room.power_levels", "", power, eventSender)
	return power
}

/**
 * Set a user's power level for a whole room hierarchy.
 * @param {string} spaceID
 * @param {string} mxid
 * @param {number} power
 */
async function setUserPowerCascade(spaceID, mxid, power) {
	assert(spaceID[0] === "!")
	assert(mxid[0] === "@")
	const rooms = await getFullHierarchy(spaceID)
	await setUserPower(spaceID, mxid, power)
	for (const room of rooms) {
		await setUserPower(room.room_id, mxid, power)
	}
}

async function ping() {
	// not using mreq so that we can read the status code
	const res = await fetch(`${mreq.baseUrl}/client/v1/appservice/${reg.id}/ping`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${reg.as_token}`
		},
		body: "{}"
	})
	const root = await res.json()
	return {
		ok: res.ok,
		status: res.status,
		root
	}
}

/**
 * @param {string} mxc
 * @param {RequestInit} [init]
 * @return {Promise<Response & {body: streamWeb.ReadableStream<Uint8Array>}>}
 */
async function getMedia(mxc, init = {}) {
	const mediaParts = mxc?.match(/^mxc:\/\/([^/]+)\/(\w+)$/)
	assert(mediaParts)
	const res = await fetch(`${mreq.baseUrl}/client/v1/media/download/${mediaParts[1]}/${mediaParts[2]}`, {
		headers: {
			Authorization: `Bearer ${reg.as_token}`
		},
		...init
	})
	if (init.method !== "HEAD") {
		assert(res.body)
	}
	// @ts-ignore
	return res
}

/**
 * Updates the m.read receipt in roomID to point to eventID.
 * This doesn't modify m.fully_read, which matches [the behaviour of matrix-bot-sdk.](https://github.com/element-hq/matrix-bot-sdk/blob/e72a4c498e00c6c339a791630c45d00a351f56a8/src/MatrixClient.ts#L1227)
 * @param {string} roomID
 * @param {string} eventID
 * @param {string?} [mxid]
 */
async function sendReadReceipt(roomID, eventID, mxid) {
	await mreq.mreq("POST", path(`/client/v3/rooms/${roomID}/receipt/m.read/${eventID}`, mxid), {})
}

/**
 * Acknowledge an event as read by calling api.sendReadReceipt on it.
 * @param {Ty.Event.Outer<any>} event
 * @param {string?} [mxid]
 */
async function ackEvent(event, mxid) {
	await sendReadReceipt(event.room_id, event.event_id, mxid)
}

/**
 * Resolve a room alias to a room ID.
 * @param {string} alias
 */
async function getAlias(alias) {
	/** @type {Ty.R.ResolvedRoom} */
	const root = await mreq.mreq("GET", `/client/v3/directory/room/${encodeURIComponent(alias)}`)
	return root.room_id
}

/**
 * @param {string} type namespaced event type, e.g. m.direct
 * @param {string} [mxid] you
 * @returns the *content* of the account data "event"
 */
async function getAccountData(type, mxid) {
	if (!mxid) mxid = `@${reg.sender_localpart}:${reg.ooye.server_name}`
	const root = await mreq.mreq("GET", `/client/v3/user/${mxid}/account_data/${type}`)
	return root
}

/**
 * @param {string} type namespaced event type, e.g. m.direct
 * @param {any} content whatever you want
 * @param {string} [mxid] you
 */
async function setAccountData(type, content, mxid) {
	if (!mxid) mxid = `@${reg.sender_localpart}:${reg.ooye.server_name}`
	await mreq.mreq("PUT", `/client/v3/user/${mxid}/account_data/${type}`, content)
}

/**
 * @param {{presence: "online" | "offline" | "unavailable", status_msg?: string}} data
 * @param {string} mxid
 */
async function setPresence(data, mxid) {
	await mreq.mreq("PUT", path(`/client/v3/presence/${mxid}/status`, mxid), data)
}

/**
 * @param {string} mxid
 * @returns {Promise<{displayname?: string, avatar_url?: string}>}
 */
function getProfile(mxid) {
	return mreq.mreq("GET", `/client/v3/profile/${mxid}`)
}

module.exports.path = path
module.exports.register = register
module.exports.createRoom = createRoom
module.exports.joinRoom = joinRoom
module.exports.inviteToRoom = inviteToRoom
module.exports.leaveRoom = leaveRoom
module.exports.leaveRoomWithReason = leaveRoomWithReason
module.exports.getEvent = getEvent
module.exports.getEventForTimestamp = getEventForTimestamp
module.exports.getAllState = getAllState
module.exports.getStateEvent = getStateEvent
module.exports.getJoinedMembers = getJoinedMembers
module.exports.getMembers = getMembers
module.exports.getHierarchy = getHierarchy
module.exports.getFullHierarchy = getFullHierarchy
module.exports.generateFullHierarchy = generateFullHierarchy
module.exports.getRelations = getRelations
module.exports.getFullRelations = getFullRelations
module.exports.sendState = sendState
module.exports.sendEvent = sendEvent
module.exports.redactEvent = redactEvent
module.exports.sendTyping = sendTyping
module.exports.profileSetDisplayname = profileSetDisplayname
module.exports.profileSetAvatarUrl = profileSetAvatarUrl
module.exports.setUserPower = setUserPower
module.exports.setUserPowerCascade = setUserPowerCascade
module.exports.ping = ping
module.exports.getMedia = getMedia
module.exports.sendReadReceipt = sendReadReceipt
module.exports.ackEvent = ackEvent
module.exports.getAlias = getAlias
module.exports.getAccountData = getAccountData
module.exports.setAccountData = setAccountData
module.exports.setPresence = setPresence
module.exports.getProfile = getProfile
