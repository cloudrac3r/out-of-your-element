// @ts-check

const assert = require("assert").strict
const Ty = require("../../types")

const passthrough = require("../../passthrough")
const {discord, sync, db, select} = passthrough

/**
 * @param {Ty.Event.Outer<Ty.Event.M_Reaction>} event
 */
async function addReaction(event) {
	const channelID = select("channel_room", "channel_id", "WHERE room_id = ?").pluck().get(event.room_id)
	if (!channelID) return // We just assume the bridge has already been created
	const messageID = select("event_message", "message_id", "WHERE event_id = ? AND part = 0").pluck().get(event.content["m.relates_to"].event_id) // 0 = primary
	if (!messageID) return // Nothing can be done if the parent message was never bridged.

	const emoji = event.content["m.relates_to"].key // TODO: handle custom text or emoji reactions
	let discordPreferredEncoding
	if (emoji.startsWith("mxc://")) {
		// Custom emoji
		const row = select("emoji", ["id", "name"], "WHERE mxc_url = ?").get(emoji)
		if (row) {
			// Great, we know exactly what this emoji is!
			discordPreferredEncoding = encodeURIComponent(`${row.name}:${row.id}`)
		} else {
			// We don't have this emoji and there's no realistic way to just-in-time upload a new emoji somewhere.
			// We can't try using a known emoji with the same name because we don't even know what the name is. We only have the mxc url.
			// Sucks!
			return
		}
	} else {
		// Default emoji
		// https://github.com/discord/discord-api-docs/issues/2723#issuecomment-807022205 ????????????
		const encoded = encodeURIComponent(emoji)
		const encodedTrimmed = encoded.replace(/%EF%B8%8F/g, "")

		const forceTrimmedList = [
			"%F0%9F%91%8D", // 👍
			"%E2%AD%90" // ⭐
		]

		discordPreferredEncoding =
			( forceTrimmedList.includes(encodedTrimmed) ? encodedTrimmed
			: encodedTrimmed !== encoded && [...emoji].length === 2 ? encoded
			: encodedTrimmed)

		console.log("add reaction from matrix:", emoji, encoded, encodedTrimmed, "chosen:", discordPreferredEncoding)
	}

	return discord.snow.channel.createReaction(channelID, messageID, discordPreferredEncoding) // acting as the discord bot itself
}

module.exports.addReaction = addReaction
