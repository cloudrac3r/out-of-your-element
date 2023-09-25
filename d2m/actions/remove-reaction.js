// @ts-check

const Ty = require("../../types")
const assert = require("assert").strict

const passthrough = require("../../passthrough")
const {discord, sync, db, select} = passthrough
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("../converters/emoji-to-key")} */
const emojiToKey = sync.require("../converters/emoji-to-key")

/**
 * @param {import("discord-api-types/v10").GatewayMessageReactionRemoveDispatchData} data
 */
async function removeReaction(data) {
	const roomID = select("channel_room", "room_id", "WHERE channel_id = ?").pluck().get(data.channel_id)
	if (!roomID) return
	const eventIDForMessage = select("event_message", "event_id", "WHERE message_id = ? AND part = 0").pluck().get(data.message_id)
	if (!eventIDForMessage) return
	const mxid = select("sim", "mxid", "WHERE discord_id = ?").pluck().get(data.user_id)
	if (!mxid) return

	/** @type {Ty.Pagination<Ty.Event.Outer<Ty.Event.M_Reaction>>} */
	const relations = await api.getRelations(roomID, eventIDForMessage, "m.annotation")
	const key = await emojiToKey.emojiToKey(data.emoji)
	const eventIDForReaction = relations.chunk.find(e => e.sender === mxid && e.content["m.relates_to"].key === key)
	if (!eventIDForReaction) return

	await api.redactEvent(roomID, eventIDForReaction.event_id, mxid)
}

module.exports.removeReaction = removeReaction
