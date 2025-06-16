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
	const channelID = select("channel_room", "channel_id", {room_id: event.room_id}).pluck().get()
	if (!channelID) return // We just assume the bridge has already been created
	const messageID = select("event_message", "message_id", {event_id: event.content["m.relates_to"].event_id}, "ORDER BY reaction_part").pluck().get()
	if (!messageID) return // Nothing can be done if the parent message was never bridged.

	const key = event.content["m.relates_to"].key
	const discordPreferredEncoding = await emoji.encodeEmoji(key, event.content.shortcode)
	if (!discordPreferredEncoding) return

	try {
		await discord.snow.channel.createReaction(channelID, messageID, discordPreferredEncoding) // acting as the discord bot itself
	} catch (e) {
		if (e.message?.includes("Maximum number of reactions reached")) {
			// we'll silence this particular error to avoid spamming the chat
			// not adding it to the database otherwise a m->d removal would try calling the API
			return
		}
		if (e.message?.includes("Unknown Emoji")) {
			// happens if a matrix user tries to add on to a super reaction
			return
		}
		throw e
	}

	db.prepare("REPLACE INTO reaction (hashed_event_id, message_id, encoded_emoji, original_encoding) VALUES (?, ?, ?, ?)").run(utils.getEventIDHash(event.event_id), messageID, discordPreferredEncoding, key)
}

module.exports.addReaction = addReaction
