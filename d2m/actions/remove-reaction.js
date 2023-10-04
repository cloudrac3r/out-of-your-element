// @ts-check

const Ty = require("../../types")
const assert = require("assert").strict

const passthrough = require("../../passthrough")
const {discord, sync, db, select} = passthrough
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("../converters/emoji-to-key")} */
const emojiToKey = sync.require("../converters/emoji-to-key")
/** @type {import("../../m2d/converters/utils")} */
const utils = sync.require("../../m2d/converters/utils")
/** @type {import("../../m2d/converters/emoji")} */
const emoji = sync.require("../../m2d/converters/emoji")

/**
 * @param {import("discord-api-types/v10").GatewayMessageReactionRemoveDispatchData} data
 */
async function removeReaction(data) {
	const roomID = select("channel_room", "room_id", "WHERE channel_id = ?").pluck().get(data.channel_id)
	if (!roomID) return
	const eventIDForMessage = select("event_message", "event_id", "WHERE message_id = ? AND part = 0").pluck().get(data.message_id)
	if (!eventIDForMessage) return

	/** @type {Ty.Pagination<Ty.Event.Outer<Ty.Event.M_Reaction>>} */
	const relations = await api.getRelations(roomID, eventIDForMessage, "m.annotation")
	const key = await emojiToKey.emojiToKey(data.emoji)

	const wantToRemoveMatrixReaction = data.user_id === discord.application.id
	for (const event of relations.chunk) {
		if (event.content["m.relates_to"].key === key) {
			const lookingAtMatrixReaction = !utils.eventSenderIsFromDiscord(event.sender)
			if (lookingAtMatrixReaction && wantToRemoveMatrixReaction) {
				// We are removing a Matrix user's reaction, so we need to redact from the correct user ID (not @_ooye_matrix_bridge).
				// Even though the bridge bot only reacted once on Discord-side, multiple Matrix users may have
				// reacted on Matrix-side. Semantically, we want to remove the reaction from EVERY Matrix user.
				await api.redactEvent(roomID, event.event_id)
				// Clean up the database
				const hash = utils.getEventIDHash(event.event_id)
				db.prepare("DELETE FROM reaction WHERE hashed_event_id = ?").run(hash)
			}
			if (!lookingAtMatrixReaction && !wantToRemoveMatrixReaction) {
				// We are removing a Discord user's reaction, so we just make the sim user remove it.
				const mxid = select("sim", "mxid", "WHERE user_id = ?").pluck().get(data.user_id)
				if (mxid === event.sender) {
					await api.redactEvent(roomID, event.event_id, mxid)
				}
			}
		}
	}
}

/**
 * @param {import("discord-api-types/v10").GatewayMessageReactionRemoveEmojiDispatchData} data
 */
async function removeEmojiReaction(data) {
	const roomID = select("channel_room", "room_id", "WHERE channel_id = ?").pluck().get(data.channel_id)
	if (!roomID) return
	const eventIDForMessage = select("event_message", "event_id", "WHERE message_id = ? AND part = 0").pluck().get(data.message_id)
	if (!eventIDForMessage) return

	/** @type {Ty.Pagination<Ty.Event.Outer<Ty.Event.M_Reaction>>} */
	const relations = await api.getRelations(roomID, eventIDForMessage, "m.annotation")
	const key = await emojiToKey.emojiToKey(data.emoji)

	for (const event of relations.chunk) {
		if (event.content["m.relates_to"].key === key) {
			const mxid = utils.eventSenderIsFromDiscord(event.sender) ? event.sender : undefined
			await api.redactEvent(roomID, event.event_id, mxid)
		}
	}

	const discordPreferredEncoding = emoji.encodeEmoji(key, undefined)
	db.prepare("DELETE FROM reaction WHERE message_id = ? AND encoded_emoji = ?").run(data.message_id, discordPreferredEncoding)
}

/**
 * @param {import("discord-api-types/v10").GatewayMessageReactionRemoveAllDispatchData} data
 */
async function removeAllReactions(data) {
	const roomID = select("channel_room", "room_id", "WHERE channel_id = ?").pluck().get(data.channel_id)
	if (!roomID) return
	const eventIDForMessage = select("event_message", "event_id", "WHERE message_id = ? AND part = 0").pluck().get(data.message_id)
	if (!eventIDForMessage) return

	/** @type {Ty.Pagination<Ty.Event.Outer<Ty.Event.M_Reaction>>} */
	const relations = await api.getRelations(roomID, eventIDForMessage, "m.annotation")

	for (const event of relations.chunk) {
		const mxid = utils.eventSenderIsFromDiscord(event.sender) ? event.sender : undefined
		await api.redactEvent(roomID, event.event_id, mxid)
	}

	db.prepare("DELETE FROM reaction WHERE message_id = ?").run(data.message_id)
}

module.exports.removeReaction = removeReaction
module.exports.removeEmojiReaction = removeEmojiReaction
module.exports.removeAllReactions = removeAllReactions
