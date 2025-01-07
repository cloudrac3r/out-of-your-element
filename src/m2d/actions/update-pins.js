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
		const row = from("event_message").join("message_channel", "message_id").where({event_id, part: 0}).select("channel_id", "message_id").get()
		if (!row) continue
		if (added) {
			discord.snow.channel.addChannelPinnedMessage(row.channel_id, row.message_id, "Message pinned on Matrix")
		} else {
			discord.snow.channel.removeChannelPinnedMessage(row.channel_id, row.message_id, "Message unpinned on Matrix")
		}
	}
}

module.exports.updatePins = updatePins
