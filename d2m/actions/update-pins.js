// @ts-check

const passthrough = require("../../passthrough")
const {discord, sync} = passthrough
/** @type {import("../converters/pins-to-list")} */
const pinsToList = sync.require("../converters/pins-to-list")
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")

/**
 * @param {string} channelID
 * @param {string} roomID
 */
async function updatePins(channelID, roomID) {
	const pins = await discord.snow.channel.getChannelPinnedMessages(channelID)
	const eventIDs = pinsToList.pinsToList(pins)
	await api.sendState(roomID, "m.room.pinned_events", "", {
		pinned: eventIDs
	})
}

module.exports.updatePins = updatePins
