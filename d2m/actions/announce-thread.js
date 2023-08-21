// @ts-check

const assert = require("assert")

const passthrough = require("../../passthrough")
const { discord, sync, db } = passthrough
/** @type {import("../converters/message-to-event")} */
const messageToEvent = sync.require("../converters/message-to-event")
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("./register-user")} */
const registerUser = sync.require("./register-user")
/** @type {import("../actions/create-room")} */
const createRoom = sync.require("../actions/create-room")

/**
 * @param {string} parentRoomID
 * @param {string} threadRoomID
 * @param {import("discord-api-types/v10").APIThreadChannel} thread
 */
async function announceThread(parentRoomID, threadRoomID, thread) {
   /** @type {string?} */
   const creatorMxid = db.prepare("SELECT mxid FROM sim WHERE discord_id = ?").pluck().get(thread.owner_id)
   /** @type {string?} */
   const branchedFromEventID = db.prepare("SELECT event_id FROM event_message WHERE message_id = ?").get(thread.id)

   const msgtype = creatorMxid ? "m.emote" : "m.text"
   const template = creatorMxid ? "started a thread:" : "Thread started:"
   let body = `${template} ${thread.name} https://matrix.to/#/${threadRoomID}`
   let html = `${template} <a href="https://matrix.to/#/${threadRoomID}">${thread.name}</a>`

   const mentions = {}

   await api.sendEvent(parentRoomID, "m.room.message", {
      msgtype,
      body: `${template} ,
      format: "org.matrix.custom.html",
      formatted_body: "",
      "m.mentions": mentions

   }, creatorMxid)
}

module.exports.announceThread = announceThread
