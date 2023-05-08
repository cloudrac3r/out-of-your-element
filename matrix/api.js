// @ts-check

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
 * @param {string} [mxid] optional: user to act as, for the ?user_id parameter
 * @returns {string} the new endpoint
 */
function path(p, mxid) {
   if (!mxid) return p
   const u = new URL(p, "http://localhost")
   u.searchParams.set("user_id", mxid)
   return u.pathname + "?" + u.searchParams.toString()
}

/**
 * @param {string} username
 * @returns {Promise<import("../types").R.Registered>}
 */
function register(username) {
   return mreq.mreq("POST", "/client/v3/register", {
      type: "m.login.application_service",
      username
   })
}

/**
 * @returns {Promise<string>} room ID
 */
async function createRoom(content) {
   /** @type {import("../types").R.RoomCreated} */
   const root = await mreq.mreq("POST", "/client/v3/createRoom", content)
   return root.room_id
}

/**
 * @returns {Promise<string>} room ID
 */
async function joinRoom(roomIDOrAlias, mxid) {
   /** @type {import("../types").R.RoomJoined} */
   const root = await mreq.mreq("POST", path(`/client/v3/join/${roomIDOrAlias}`, mxid))
   return root.room_id
}

async function inviteToRoom(roomID, mxidToInvite, mxid) {
   await mreq.mreq("POST", path(`/client/v3/rooms/${roomID}/invite`, mxid), {
      user_id: mxidToInvite
   })
}

/**
 * @param {string} roomID
 * @returns {Promise<import("../types").Event.BaseStateEvent[]>}
 */
function getAllState(roomID) {
   return mreq.mreq("GET", `/client/v3/rooms/${roomID}/state`)
}

/**
 * @param {string} roomID
 * @param {string} type
 * @param {string} stateKey
 * @param {string} [mxid]
 * @returns {Promise<string>} event ID
 */
async function sendState(roomID, type, stateKey, content, mxid) {
   assert.ok(type)
   assert.ok(stateKey)
   /** @type {import("../types").R.EventSent} */
   const root = await mreq.mreq("PUT", path(`/client/v3/rooms/${roomID}/state/${type}/${stateKey}`, mxid), content)
   return root.event_id
}

async function sendEvent(roomID, type, content, mxid) {
   /** @type {import("../types").R.EventSent} */
   const root = await mreq.mreq("PUT", path(`/client/v3/rooms/${roomID}/send/${type}/${makeTxnId.makeTxnId()}`, mxid), content)
   return root.event_id
}

module.exports.path = path
module.exports.register = register
module.exports.createRoom = createRoom
module.exports.joinRoom = joinRoom
module.exports.inviteToRoom = inviteToRoom
module.exports.getAllState = getAllState
module.exports.sendState = sendState
module.exports.sendEvent = sendEvent
