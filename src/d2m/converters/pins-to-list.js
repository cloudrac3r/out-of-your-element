// @ts-check

const {select} = require("../../passthrough")

/**
 * @param {import("discord-api-types/v10").RESTGetAPIChannelPinsResult} pins
 * @param {{"m.room.pinned_events/"?: {pinned?: string[]}}} kstate
 */
function pinsToList(pins, kstate) {
	let alreadyPinned = kstate["m.room.pinned_events/"]?.pinned || []

	// If any of the already pinned messages are bridged messages then remove them from the already pinned list.
	//   * If a bridged message is still pinned then it'll be added back in the next step.
	//   * If a bridged message was unpinned from Discord-side then it'll be unpinned from our side due to this step.
	//   * Matrix-only unbridged messages that are pinned will remain pinned.
	alreadyPinned = alreadyPinned.filter(event_id => {
		const messageID = select("event_message", "message_id", {event_id}).pluck().get()
		return !messageID || pins.find(m => m.id === messageID) // if it is bridged then remove it from the filter
	})

	/** @type {string[]} */
	const result = []
	for (const message of pins) {
		const eventID = select("event_message", "event_id", {message_id: message.id, part: 0}).pluck().get()
		if (eventID && !alreadyPinned.includes(eventID)) result.push(eventID)
	}
	result.reverse()
	return alreadyPinned.concat(result)
}

module.exports.pinsToList = pinsToList
