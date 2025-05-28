// @ts-check

const passthrough = require("../../passthrough")
const {discord, sync, db} = passthrough
/** @type {import("../converters/pins-to-list")} */
const pinsToList = sync.require("../converters/pins-to-list")
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("../../matrix/kstate")} */
const ks = sync.require("../../matrix/kstate")

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
	try {
		var discordPins = await discord.snow.channel.getChannelPinnedMessages(channelID)
	} catch (e) {
		if (e.message === `{"message": "Missing Access", "code": 50001}`) {
			return // Discord sends channel pins update events even for channels that the bot can't view/get pins in, just ignore it
		}
		throw e
	}

	const kstate = await ks.roomToKState(roomID)
	const pinned = pinsToList.pinsToList(discordPins, kstate)

	const diff = ks.diffKState(kstate, {"m.room.pinned_events/": {pinned}})
	await ks.applyKStateDiffToRoom(roomID, diff)

	db.prepare("UPDATE channel_room SET last_bridged_pin_timestamp = ? WHERE channel_id = ?").run(convertedTimestamp || 0, channelID)
}

module.exports.convertTimestamp = convertTimestamp
module.exports.updatePins = updatePins
