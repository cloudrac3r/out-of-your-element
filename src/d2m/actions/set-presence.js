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

	Optimisations:
	* Presence can be deactivated per-guild in OOYE settings. If the user doesn't share any presence-enabled-guilds with us, we don't need to do anything.
	* Presence can be sent for users without sims. In this case, they will be discarded from memory when the next loop begins.
	* Matrix ID is cached in memory on the Presence class. The alternative to this is querying it every time we receive a presence change event in a valid guild.
	* Presence can be sent multiple times in a row for the same user for each guild we share. The loop timer prevents these "changes" from individually reaching the homeserver.
*/

// Synapse expires each user's presence after 30 seconds and makes them offline, so we have to loop every 28 seconds and update each user again.
const presenceLoopInterval = 28e3

// Cache the list of enabled guilds rather than accessing it like multiple times per second when any user changes presence
const guildPresenceSetting = new class {
	/** @private @type {Set<string>} */ guilds
	constructor() {
		this.update()
	}
	update() {
		this.guilds = new Set(select("guild_space", "guild_id", {presence: 1}).pluck().all())
	}
	isEnabled(guildID) {
		return this.guilds.has(guildID)
	}
}

class Presence extends sync.reloadClassMethods(() => Presence) {
	/** @type {string} */ userID
	/** @type {{presence: "online" | "offline" | "unavailable", status_msg?: string}} */ data
	/** @private @type {?string | undefined} */ mxid
	/** @private @type {number} */ delay = Math.random()

	constructor(userID) {
		super()
		this.userID = userID
	}

	/**
	 * @param {string} status status field from Discord's PRESENCE_UPDATE event
	 */
	setData(status) {
		const presence =
			( status === "online" ? "online"
			: status === "offline" ? "offline"
			: "unavailable")
		this.data = {presence}
	}

	sync(presences) {
		const mxid = this.mxid ??= select("sim", "mxid", {user_id: this.userID}).pluck().get()
		if (!mxid) return presences.delete(this.userID)
		// I haven't tried, but I assume Synapse explodes if you try to update too many presences at the same time.
		// This random delay will space them out over the whole 28 second cycle.
		setTimeout(() => {
			api.setPresence(this.data, mxid).catch(() => {})
		}, this.delay * presenceLoopInterval).unref()
	}
}

const presenceTracker = new class {
	/** @private @type {Map<string, Presence>} userID -> Presence */ presences = sync.remember(() => new Map())

	constructor() {
		sync.addTemporaryInterval(() => this.syncPresences(), presenceLoopInterval)
	}

	/**
	 * This function is called for each Discord presence packet.
	 * @param {string} userID Discord user ID
	 * @param {string} guildID Discord guild ID that this presence applies to (really, the same presence applies to every single guild, but is delivered separately by Discord for some reason)
	 * @param {string} status status field from Discord's PRESENCE_UPDATE event
	 */
	incomingPresence(userID, guildID, status) {
		// stop tracking offline presence objects - they will naturally expire and fall offline on the homeserver
		if (status === "offline") return this.presences.delete(userID)
		// check if we care about this guild
		if (!guildPresenceSetting.isEnabled(guildID)) return
		// start tracking presence for user (we'll check if they have a sim in the next sync loop)
		this.getOrCreatePresence(userID).setData(status)
	}

	/** @private */
	getOrCreatePresence(userID) {
		return this.presences.get(userID) || (() => {
			const presence = new Presence(userID)
			this.presences.set(userID, presence)
			return presence
		})()
	}

	/** @private */
	syncPresences() {
		for (const presence of this.presences.values()) {
			presence.sync(this.presences)
		}
	}
}

module.exports.presenceTracker = presenceTracker
module.exports.guildPresenceSetting = guildPresenceSetting
