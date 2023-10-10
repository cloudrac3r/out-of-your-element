// @ts-check

const {select} = require("../../passthrough")

/**
 * @param {import("discord-api-types/v10").RESTGetAPIChannelPinsResult} pins
 */
function pinsToList(pins) {
	/** @type {string[]} */
	const result = []
	for (const message of pins) {
		const eventID = select("event_message", "event_id", {message_id: message.id, part: 0}).pluck().get()
		if (eventID) result.push(eventID)
	}
	return result
}

module.exports.pinsToList = pinsToList
