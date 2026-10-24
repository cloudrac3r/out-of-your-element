// @ts-check

const {discord, sync} = require("../../passthrough")

/** @type {Set<string>} channel ids that are currently typing */
const isTyping = sync.remember(() => new Set())
/** @type {Map<string, NodeJS.Timeout>} channel id -> interval */
const intervals = sync.remember(() => new Map())

/** @param {string} channelID */
function startTyping(channelID) {
	isTyping.add(channelID)
	// Start a new typing session if needed
	if (!intervals.has(channelID)) {
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
	// Schedule typing session to end
	isTyping.delete(channelID)
}

module.exports.startTyping = startTyping
module.exports.stopTyping = stopTyping
