// @ts-check

const assert = require("assert").strict
const Ty = require("../../types")

const passthrough = require("../../passthrough")
const {discord, sync, db, select} = passthrough
/** @type {import("../converters/utils")} */
const utils = sync.require("../converters/utils")
/** @type {import("../converters/emoji")} */
const emoji = sync.require("../converters/emoji")

/**
 * @param {Ty.Event.Outer<Ty.Event.M_Reaction>} event
 */
async function addReaction(event) {
	const channelID = select("channel_room", "channel_id", "WHERE room_id = ?").pluck().get(event.room_id)
	if (!channelID) return // We just assume the bridge has already been created
	const messageID = select("event_message", "message_id", "WHERE event_id = ? AND part = 0").pluck().get(event.content["m.relates_to"].event_id) // 0 = primary
	if (!messageID) return // Nothing can be done if the parent message was never bridged.

	const key = event.content["m.relates_to"].key // TODO: handle custom text or emoji reactions
	const discordPreferredEncoding = emoji.encodeEmoji(key, event.content.shortcode)
	if (!discordPreferredEncoding) return

	await discord.snow.channel.createReaction(channelID, messageID, discordPreferredEncoding) // acting as the discord bot itself

	db.prepare("REPLACE INTO reaction (hashed_event_id, message_id, encoded_emoji) VALUES (?, ?, ?)").run(utils.getEventIDHash(event.event_id), messageID, discordPreferredEncoding)
}

module.exports.addReaction = addReaction
