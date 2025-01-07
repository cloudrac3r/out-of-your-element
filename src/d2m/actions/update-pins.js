// @ts-check

const passthrough = require("../../passthrough")
const {discord, sync, db} = passthrough
/** @type {import("../converters/pins-to-list")} */
const pinsToList = sync.require("../converters/pins-to-list")
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")

/**
 * @template {string | null | undefined} T
 * @param {T} timestamp
 * @returns {T extends string ? number : null}
 */
function convertTimestamp(timestamp) {
	// @ts-ignore
	return typeof timestamp === "string" ? Math.floor(new Date(timestamp).getTime() / 1000) : null
}

/**
 * @param {string} channelID
 * @param {string} roomID
 * @param {number?} convertedTimestamp
 */
async function updatePins(channelID, roomID, convertedTimestamp) {
	const pins = await discord.snow.channel.getChannelPinnedMessages(channelID)
	const eventIDs = pinsToList.pinsToList(pins)
	await api.sendState(roomID, "m.room.pinned_events", "", {
		pinned: eventIDs
	})
	db.prepare("UPDATE channel_room SET last_bridged_pin_timestamp = ? WHERE channel_id = ?").run(convertedTimestamp || 0, channelID)
}

module.exports.convertTimestamp = convertTimestamp
module.exports.updatePins = updatePins
