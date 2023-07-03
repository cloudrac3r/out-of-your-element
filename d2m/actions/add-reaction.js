// @ts-check

const assert = require("assert")

const passthrough = require("../../passthrough")
const { discord, sync, db } = passthrough
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("./register-user")} */
const registerUser = sync.require("./register-user")
/** @type {import("../actions/create-room")} */
const createRoom = sync.require("../actions/create-room")

/**
 * @param {import("discord-api-types/v10").GatewayMessageReactionAddDispatchData} data
 */
async function addReaction(data) {
   const user = data.member?.user
   assert.ok(user && user.username)
   const parentID = db.prepare("SELECT event_id FROM event_message WHERE message_id = ? AND part = 0").pluck().get(data.message_id) // 0 = primary
   if (!parentID) return // TODO: how to handle reactions for unbridged messages? is there anything I can do?
   assert.equal(typeof parentID, "string")
	const roomID = await createRoom.ensureRoom(data.channel_id)
	const senderMxid = await registerUser.ensureSimJoined(user, roomID)
	const eventID = api.sendEvent(roomID, "m.reaction", {
      "m.relates_to": {
         rel_type: "m.annotation",
         event_id: parentID,
         key: data.emoji.name
      }
   }, senderMxid)
	return eventID
}

module.exports.addReaction = addReaction
