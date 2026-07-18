// @ts-check

const {discord} = require("../../passthrough")

/** @type {Set<string>} channel ids that are currently typing */
const isTyping = new Set()
/** @type {Map<string, NodeJS.Timeout>} channel id -> interval */
const intervals = new Map()

/** @param {string} channelID */
function startTyping(channelID) {
	if (!isTyping.has(channelID)) {
		// Start a new typing session
		isTyping.add(channelID)
		intervals.set(channelID, setInterval(refreshTyping, 8e3, channelID))
		discord.snow.channel.startChannelTyping(channelID).catch(() => {})
	}
}

/** @param {string} channelID */
function refreshTyping(channelID) {
	if (isTyping.has(channelID)) {
		// Continue typing session
		discord.snow.channel.startChannelTyping(channelID).catch(() => {})
	} else {
		// End typing session
		clearInterval(intervals.get(channelID))
		intervals.delete(channelID)
	}
}

/** @param {string} channelID */
function stopTyping(channelID) {
	if (isTyping.has(channelID)) {
		// Schedule typing session to end
		isTyping.delete(channelID)
	}
}

module.exports.startTyping = startTyping
module.exports.stopTyping = stopTyping
