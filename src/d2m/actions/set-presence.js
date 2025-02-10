// @ts-check

const passthrough = require("../../passthrough")
const {sync, select} = passthrough
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")

/*
	We do this in two phases for optimisation reasons.
	Discord sends us an event when the presence *changes.*
	We need to keep the event data in memory because we need to *repeatedly* send it to Matrix using a long-lived loop.

	There are two phases to get it from Discord to Matrix.
	The first phase stores Discord presence data in memory.
	The second phase loops over the memory and sends it on to Matrix.

	In the first phase, for optimisation reasons, we want to do as little work as possible if the presence doesn't actually need to be sent all the way through.
	* Presence can be deactivated per-guild in OOYE settings. If it's deactivated for all of a user's guilds, we shouldn't send them to the second phase.
	* Presence can be sent for users without sims. In this case, we shouldn't send them to the second phase.
	* Presence can be sent multiple times in a row for the same user for each guild we share. We want to batch these up so we only query the mxid and enter the second phase once per user.
*/


// ***** first phase *****


// Delay before querying user details and putting them in memory.
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
 * This function is called for each Discord presence packet.
 * @param {string} userID Discord user ID
 * @param {string} guildID Discord guild ID that this presence applies to (really, the same presence applies to every single guild, but is delivered separately by Discord for some reason)
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
	if (presence === "offline") {
		userPresence.delete(mxid) // stop syncing next cycle
	} else {
		const delay = userPresence.get(mxid)?.delay || presenceLoopInterval * Math.random() // distribute the updates across the presence loop
		userPresence.set(mxid, {data: {presence}, delay}) // will be synced next cycle
	}
}


// ***** second phase *****


// Synapse expires each user's presence after 30 seconds and makes them offline, so we have loop every 28 seconds and update each user again.
const presenceLoopInterval = 28e3

/** @type {Map<string, {data: {presence: "online" | "offline" | "unavailable", status_msg?: string}, delay: number}>} mxid -> presence data to send to api */
const userPresence = new Map()

sync.addTemporaryInterval(() => {
	for (const [mxid, memory] of userPresence.entries()) {
		// I haven't tried, but assuming Synapse explodes if you try to update too many presences at the same time,
		// I'll space them out over the whole 28 second cycle.
		setTimeout(() => {
			const d = new Date().toISOString().slice(0, 19)
			api.setPresence(memory.data, mxid).catch(e => {
				console.error("d->m: Skipping presence update failure:")
				console.error(e)
			})
		}, memory.delay)
	}
}, presenceLoopInterval)


module.exports.setPresence = setPresence
module.exports.checkPresenceEnabledGuilds = checkPresenceEnabledGuilds
