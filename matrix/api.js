// @ts-check

const assert = require("assert")

const passthrough = require("../passthrough")
const { discord, sync, db } = passthrough
/** @type {import("./mreq")} */
const mreq = sync.require("./mreq")
/** @type {import("./file")} */
const file = sync.require("./file")

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
 * @returns {Promise<import("../types").R.RoomCreated>}
 */
function createRoom(content) {
   return mreq.mreq("POST", "/client/v3/createRoom", content)
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
 * @returns {Promise<import("../types").R.EventSent>}
 */
function sendState(roomID, type, stateKey, content) {
   assert.ok(type)
   assert.ok(stateKey)
   return mreq.mreq("PUT", `/client/v3/rooms/${roomID}/state/${type}/${stateKey}`, content)
}

module.exports.register = register
module.exports.createRoom = createRoom
module.exports.getAllState = getAllState
module.exports.sendState = sendState
