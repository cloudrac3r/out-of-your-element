// @ts-check

const Ty = require("../../types")
const DiscordTypes = require("discord-api-types/v10")

const passthrough = require("../../passthrough")
const {discord, sync, db, select} = passthrough
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("../converters/emoji-to-key")} */
const emojiToKey = sync.require("../converters/emoji-to-key")
/** @type {import("../../m2d/converters/emoji")} */
const emoji = sync.require("../../m2d/converters/emoji")
/** @type {import("../converters/remove-reaction")} */
const converter = sync.require("../converters/remove-reaction")

/**
 * @param {DiscordTypes.GatewayMessageReactionRemoveDispatchData | DiscordTypes.GatewayMessageReactionRemoveEmojiDispatchData | DiscordTypes.GatewayMessageReactionRemoveAllDispatchData} data
 */
async function removeSomeReactions(data) {
	const roomID = select("channel_room", "room_id", {channel_id: data.channel_id}).pluck().get()
	if (!roomID) return
	const eventIDForMessage = select("event_message", "event_id", {message_id: data.message_id, part: 0}).pluck().get()
	if (!eventIDForMessage) return

	/** @type {Ty.Pagination<Ty.Event.Outer<Ty.Event.M_Reaction>>} */
	const relations = await api.getRelations(roomID, eventIDForMessage, "m.annotation")

	// Run the proper strategy and any strategy-specific database changes
	const removals = await
		( "user_id" in data ? removeReaction(data, relations)
		: "emoji" in data ? removeEmojiReaction(data, relations)
		: removeAllReactions(data, relations))

	// Redact the events and delete individual stored events in the database
	for (const removal of removals) {
		await api.redactEvent(roomID, removal.eventID, removal.mxid)
		if (removal.hash) db.prepare("DELETE FROM reaction WHERE hashed_event_id = ?").run(removal.hash)
	}
}

/**
 * @param {DiscordTypes.GatewayMessageReactionRemoveDispatchData} data
 * @param {Ty.Pagination<Ty.Event.Outer<Ty.Event.M_Reaction>>} relations
 */
async function removeReaction(data, relations) {
	const key = await emojiToKey.emojiToKey(data.emoji)
	return converter.removeReaction(data, relations, key)
}

/**
 * @param {DiscordTypes.GatewayMessageReactionRemoveEmojiDispatchData} data
 * @param {Ty.Pagination<Ty.Event.Outer<Ty.Event.M_Reaction>>} relations
 */
async function removeEmojiReaction(data, relations) {
	const key = await emojiToKey.emojiToKey(data.emoji)
	const discordPreferredEncoding = emoji.encodeEmoji(key, undefined)
	db.prepare("DELETE FROM reaction WHERE message_id = ? AND encoded_emoji = ?").run(data.message_id, discordPreferredEncoding)

	return converter.removeEmojiReaction(data, relations, key)
}

/**
 * @param {DiscordTypes.GatewayMessageReactionRemoveAllDispatchData} data
 * @param {Ty.Pagination<Ty.Event.Outer<Ty.Event.M_Reaction>>} relations
 */
async function removeAllReactions(data, relations) {
	db.prepare("DELETE FROM reaction WHERE message_id = ?").run(data.message_id)

	return converter.removeAllReactions(data, relations)
}

module.exports.removeSomeReactions = removeSomeReactions
