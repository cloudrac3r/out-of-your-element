// @ts-check

const passthrough = require("../../passthrough")
const {sync, select} = passthrough
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")

// Adding a debounce to all updates because events are issued multiple times, once for each guild.
// Sometimes a status update is even issued twice in a row for the same user+guild, weird!
const presenceDelay = 1500
/** @type {Map<string, NodeJS.Timeout>} user ID -> cancelable timeout */
const presenceDelayMap = new Map()

// Access the list of enabled guilds as needed rather than like multiple times per second when a user changes presence
/** @type {Set<string>} */
let presenceEnabledGuilds
function checkPresenceEnabledGuilds() {
	presenceEnabledGuilds = new Set(select("guild_space", "guild_id", {presence: 1}).pluck().all())
}
checkPresenceEnabledGuilds()

/**
 * @param {string} userID Discord user ID
 * @param {string} guildID Discord guild ID that this presence applies to (really, the same presence applies to every single guild, but is delivered separately)
 * @param {string} status status field from Discord's PRESENCE_UPDATE event
 */
function setPresence(userID, guildID, status) {
	// check if we care about this guild
	if (!presenceEnabledGuilds.has(guildID)) return
	// cancel existing timer if one is already set
	if (presenceDelayMap.has(userID)) {
		clearTimeout(presenceDelayMap.get(userID))
	}
	// new timer, which will run if nothing else comes in soon
	presenceDelayMap.set(userID, setTimeout(setPresenceCallback, presenceDelay, userID, status).unref())
}

/**
 * @param {string} user_id Discord user ID
 * @param {string} status status field from Discord's PRESENCE_UPDATE event
 */
function setPresenceCallback(user_id, status) {
	presenceDelayMap.delete(user_id)
	const mxid = select("sim", "mxid", {user_id}).pluck().get()
	if (!mxid) return
	const presence =
		( status === "online" ? "online"
		: status === "offline" ? "offline"
		: "unavailable") // idle, dnd, and anything else they dream up in the future
	api.setPresence(presence, mxid).catch(e => {
		console.error("d->m: Skipping presence update failure:")
		console.error(e)
	})
}

module.exports.setPresence = setPresence
module.exports.checkPresenceEnabledGuilds = checkPresenceEnabledGuilds
