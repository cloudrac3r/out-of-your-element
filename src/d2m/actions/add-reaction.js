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
/** @type {import("../converters/emoji-to-key")} */
const emojiToKey = sync.require("../converters/emoji-to-key")


/**
 * @param {import("discord-api-types/v10").GatewayMessageReactionAddDispatchData} data
 */
async function addReaction(data) {
	const user = data.member?.user
	assert.ok(user && user.username)

	const parentID = select("event_message", "event_id", {message_id: data.message_id, reaction_part: 0}).pluck().get()
	if (!parentID) return // Nothing can be done if the parent message was never bridged.
	assert.equal(typeof parentID, "string")

	const key = await emojiToKey.emojiToKey(data.emoji, data.message_id)
	const shortcode = key.startsWith("mxc://") ? `:${data.emoji.name}:` : undefined

	const roomID = await createRoom.ensureRoom(data.channel_id)
	const senderMxid = await registerUser.ensureSimJoined(user, roomID)
	const eventID = await api.sendEvent(roomID, "m.reaction", {
		"m.relates_to": {
			rel_type: "m.annotation",
			event_id: parentID,
			key
		},
		shortcode
	}, senderMxid)
	return eventID
}

module.exports.addReaction = addReaction
