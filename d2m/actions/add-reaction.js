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
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")

/**
 * @param {import("discord-api-types/v10").GatewayMessageReactionAddDispatchData} data
 */
async function addReaction(data) {
	const user = data.member?.user
	assert.ok(user && user.username)

	const parentID = select("event_message", "event_id", "WHERE message_id = ? AND part = 0").pluck().get(data.message_id) // 0 = primary
	if (!parentID) return // Nothing can be done if the parent message was never bridged.
	assert.equal(typeof parentID, "string")

	let key
	if (data.emoji.id) {
		// Custom emoji
		const mxc = select("emoji", "mxc_url", "WHERE id = ?").pluck().get(data.emoji.id)
		if (mxc) {
			// The custom emoji is registered and we should send it
			key = mxc
		} else {
			// The custom emoji is not registered. We will register it and then add it.
			const mxc = await file.uploadDiscordFileToMxc(file.emoji(data.emoji.id, data.emoji.animated))
			db.prepare("INSERT OR IGNORE INTO emoji (id, name, animated, mxc_url) VALUES (?, ?, ?, ?)").run(data.emoji.id, data.emoji.name, data.emoji.animated, mxc)
			key = mxc
			// TODO: what happens if the matrix user also tries adding this reaction? the bridge bot isn't able to use that emoji...
		}
	} else {
		// Default emoji
		key = data.emoji.name
	}

	const roomID = await createRoom.ensureRoom(data.channel_id)
	const senderMxid = await registerUser.ensureSimJoined(user, roomID)
	const eventID = await api.sendEvent(roomID, "m.reaction", {
		"m.relates_to": {
			rel_type: "m.annotation",
			event_id: parentID,
			key
		}
	}, senderMxid)
	return eventID
}

module.exports.addReaction = addReaction
