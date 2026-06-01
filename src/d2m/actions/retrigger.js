// @ts-check

const {EventEmitter} = require("events")
const passthrough = require("../../passthrough")
const {select, sync, from} = passthrough
/** @type {import("../../matrix/utils")} */
const utils = sync.require("../../matrix/utils")

/*
	Due to Eventual Consistency(TM) an update/delete may arrive before the original message arrives
	(or before the it has finished being bridged to an event).
	In this case, wait until the original message has finished bridging, then retrigger the passed function.
*/

const DEBUG_RETRIGGER = false

function debugRetrigger(message) {
	if (DEBUG_RETRIGGER) {
		console.log(message)
	}
}

const storage = new class {
	/** @private @type {Set<string>} */
	paused = new Set()
	/** @private @type {Map<string, ((found: Boolean) => any)[]>} id -> list of resolvers */
	resolves = new Map()
	/** @private @type {Map<string, ReturnType<setTimeout>>} id -> timer */
	timers = new Map()

	/**
	 * The purpose of storage is to store `resolve` and call it at a later time.
	 * @param {string} id
	 * @param {(found: Boolean) => any} resolve
	 */
	store(id, resolve) {
		debugRetrigger(`[retrigger] STORE id = ${id}`)
		this.resolves.set(id, (this.resolves.get(id) || []).concat(resolve)) // add to list in map value
		if (!this.timers.has(id)) {
			debugRetrigger(`[retrigger] SET TIMER id = ${id}`)
			this.timers.set(id, setTimeout(() => this.resolve(id, false), 60 * 1000).unref()) // 1 minute
		}
	}
	
	/** @param {string} id */
	isNotPaused(id) {
		return !storage.paused.has(id)
	}

	/** @param {string} id */
	pause(id) {
		debugRetrigger(`[retrigger] PAUSE id = ${id}`)
		this.paused.add(id)
	}

	/**
	 * Go through `resolves` storage and resolve them all. (Also resets timer/paused.)
	 * @param {string} id
	 * @param {boolean} value
	 */
	resolve(id, value) {
		if (this.paused.has(id)) {
			debugRetrigger(`[retrigger] RESUME id = ${id}`)
			this.paused.delete(id)
		}

		if (this.resolves.has(id)) {
			debugRetrigger(`[retrigger] RESOLVE ${value} id = ${id}`)
			const fns = this.resolves.get(id) || []
			this.resolves.delete(id)
			for (const fn of fns) {
				fn(value)
			}
		}

		if (this.timers.has(id)) {
			clearTimeout(this.timers.get(id))
			this.timers.delete(id)
		}
	}
}

/**
 * @param {string} id
 * @param {(found: Boolean) => any} resolve
 * @param {boolean} existsInDatabase
 */
function waitFor(id, resolve, existsInDatabase) {
	if (existsInDatabase && storage.isNotPaused(id)) { // if event already exists and isn't paused then resolve immediately
		debugRetrigger(`[retrigger] EXISTS id = ${id}`)
		return resolve(true)
	}

	// doesn't exist. wait for it to exist. storage will resolve true if it exists or false if it timed out
	return storage.store(id, resolve)
}

const GET_EVENT_PREPARED = from("event_message").select("event_id").and("WHERE event_id = ?").prepare().raw()
/**
 * @param {string} eventID
 * @returns {Promise<boolean>} if true then the message did not arrive
 */
function waitForEvent(eventID) {
	const {promise, resolve} = Promise.withResolvers()
	waitFor(eventID, resolve, !!GET_EVENT_PREPARED.get(eventID))
	return promise
}

const GET_MESSAGE_PREPARED = from("event_message").select("message_id").and("WHERE message_id = ?").prepare().raw()
/**
 * @param {string} messageID
 * @returns {Promise<boolean>} if true then the message did not arrive
 */
function waitForMessage(messageID) {
	const {promise, resolve} = Promise.withResolvers()
	waitFor(messageID, resolve, !!GET_MESSAGE_PREPARED.get(messageID))
	return promise
}

const GET_REACTION_EVENT_PREPARED = from("reaction").select("hashed_event_id").and("WHERE hashed_event_id = ?").prepare().raw()
/**
 * @param {string} eventID
 * @returns {Promise<boolean>} if true then the message did not arrive
 */
function waitForReactionEvent(eventID) {
	const {promise, resolve} = Promise.withResolvers()
	waitFor(eventID, resolve, !!GET_REACTION_EVENT_PREPARED.get(utils.getEventIDHash(eventID)))
	return promise
}

/**
 * Anything calling retrigger during the callback will be paused and retriggered after the callback resolves.
 * @template T
 * @param {string} id
 * @param {Promise<T>} promise
 * @returns {Promise<T>}
 */
async function pauseChanges(id, promise) {
	try {
		storage.pause(id)
		return await promise
	} finally {
		finishedBridging(id)
	}
}

/**
 * Triggers any pending operations that were waiting on the corresponding event ID.
 * @param {string} id
 */
function finishedBridging(id) {
	storage.resolve(id, true)
}

module.exports.waitForMessage = waitForMessage
module.exports.waitForEvent = waitForEvent
module.exports.waitForReactionEvent = waitForReactionEvent
module.exports.pauseChanges = pauseChanges
module.exports.finishedBridging = finishedBridging