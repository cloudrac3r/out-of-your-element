// @ts-check

const assert = require("assert").strict
const Ty = require("../../types")

const passthrough = require("../../passthrough")
const {discord, as, sync, db, select, from} = passthrough
/** @type {import("../../matrix/utils")} */
const utils = sync.require("../../matrix/utils")
/** @type {import("../converters/emoji")} */
const emoji = sync.require("../converters/emoji")
/** @type {import("../../d2m/actions/retrigger")} */
const retrigger = sync.require("../../d2m/actions/retrigger")

/**
 * @param {Ty.Event.Outer<Ty.Event.M_Reaction>} event
 */
async function addReaction(event) {
	// Wait until the corresponding channel and message have already been bridged
	if (retrigger.eventNotFoundThenRetrigger(event.content["m.relates_to"].event_id, as.emit.bind(as, "type:m.reaction", event))) return

	// These will exist because it passed retrigger
	const row = from("event_message").join("message_room", "message_id").join("historical_channel_room", "historical_room_index")
		.select("message_id", "reference_channel_id").where({event_id: event.content["m.relates_to"].event_id}).and("ORDER BY reaction_part ASC").get()
	assert(row)
	const messageID = row.message_id
	const channelID = row.reference_channel_id

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
		if (e.message?.includes("Unknown Message")) {
			// happens under a race condition where a message is deleted after it passes the database check above
			return
		}
		throw e
	}

	db.prepare("REPLACE INTO reaction (hashed_event_id, message_id, encoded_emoji, original_encoding) VALUES (?, ?, ?, ?)").run(utils.getEventIDHash(event.event_id), messageID, discordPreferredEncoding, key)
}

module.exports.addReaction = addReaction
