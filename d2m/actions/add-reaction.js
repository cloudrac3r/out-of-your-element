// @ts-check

const assert = require("assert").strict

const passthrough = require("../../passthrough")
const {discord, sync, db, select} = passthrough
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
	const parentID = select("event_message", "event_id", "WHERE message_id = ? AND part = 0").pluck().get(data.message_id) // 0 = primary
	if (!parentID) return // Nothing can be done if the parent message was never bridged.
	assert.equal(typeof parentID, "string")
	const roomID = await createRoom.ensureRoom(data.channel_id)
	const senderMxid = await registerUser.ensureSimJoined(user, roomID)
	const eventID = await api.sendEvent(roomID, "m.reaction", {
		"m.relates_to": {
			rel_type: "m.annotation",
			event_id: parentID,
			key: data.emoji.name
		}
	}, senderMxid)
	return eventID
}

module.exports.addReaction = addReaction
