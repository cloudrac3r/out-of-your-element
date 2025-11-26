// @ts-check

const {sync, from, discord} = require("../../passthrough")

/** @type {import("../converters/diff-pins")} */
const diffPins = sync.require("../converters/diff-pins")

/**
 * @param {string[]} pins
 * @param {string[]} prev
 */
async function updatePins(pins, prev) {
	const diff = diffPins.diffPins(pins, prev)
	for (const [event_id, added] of diff) {
		const row = from("event_message").join("message_room", "message_id").join("historical_channel_room", "historical_room_index")
			.select("reference_channel_id", "message_id").get()
		if (!row) continue
		if (added) {
			discord.snow.channel.addChannelPinnedMessage(row.reference_channel_id, row.message_id, "Message pinned on Matrix")
		} else {
			discord.snow.channel.removeChannelPinnedMessage(row.reference_channel_id, row.message_id, "Message unpinned on Matrix")
		}
	}
}

module.exports.updatePins = updatePins
