// @ts-check

const {EventEmitter} = require("events")
const passthrough = require("../../passthrough")
const {select} = passthrough

const DEBUG_RETRIGGER = false

function debugRetrigger(message) {
	if (DEBUG_RETRIGGER) {
		console.log(message)
	}
}

const paused = new Set()
const emitter = new EventEmitter()

/**
 * Due to Eventual Consistency(TM) an update/delete may arrive before the original message arrives
 * (or before the it has finished being bridged to an event).
 * In this case, wait until the original message has finished bridging, then retrigger the passed function.
 * @template {(...args: any[]) => Promise<any>} T
 * @param {string} inputID
 * @param {T} fn
 * @param {Parameters<T>} rest
 * @returns {boolean} false if the event was found and the function will be ignored, true if the event was not found and the function will be retriggered
 */
function eventNotFoundThenRetrigger(inputID, fn, ...rest) {
	if (!paused.has(inputID)) {
		if (inputID.match(/^[0-9]+$/)) {
			const eventID = select("event_message", "event_id", {message_id: inputID}).pluck().get()
			if (eventID) {
				debugRetrigger(`[retrigger] OK mid <-> eid = ${inputID} <-> ${eventID}`)
				return false // event was found so don't retrigger
			}
		} else if (inputID.match(/^\$/)) {
			const messageID = select("event_message", "message_id", {event_id: inputID}).pluck().get()
			if (messageID) {
				debugRetrigger(`[retrigger] OK eid <-> mid = ${inputID} <-> ${messageID}`)
				return false // message was found so don't retrigger
			}
		}
	}

	debugRetrigger(`[retrigger] WAIT id = ${inputID}`)
	emitter.once(inputID, () => {
		debugRetrigger(`[retrigger] TRIGGER id = ${inputID}`)
		fn(...rest)
	})
	// if the event never arrives, don't trigger the callback, just clean up
	setTimeout(() => {
		if (emitter.listeners(inputID).length) {
			debugRetrigger(`[retrigger] EXPIRE id = ${inputID}`)
		}
		emitter.removeAllListeners(inputID)
	}, 60 * 1000) // 1 minute
	return true // event was not found, then retrigger
}

/**
 * Anything calling retrigger during the callback will be paused and retriggered after the callback resolves.
 * @template T
 * @param {string} messageID
 * @param {Promise<T>} promise
 * @returns {Promise<T>}
 */
async function pauseChanges(messageID, promise) {
	try {
		debugRetrigger(`[retrigger] PAUSE id = ${messageID}`)
		paused.add(messageID)
		return await promise
	} finally {
		debugRetrigger(`[retrigger] RESUME id = ${messageID}`)
		paused.delete(messageID)
		messageFinishedBridging(messageID)
	}
}

/**
 * Triggers any pending operations that were waiting on the corresponding event ID.
 * @param {string} messageID
 */
function messageFinishedBridging(messageID) {
	if (emitter.listeners(messageID).length) {
		debugRetrigger(`[retrigger] EMIT id = ${messageID}`)
	}
	emitter.emit(messageID)
}

module.exports.eventNotFoundThenRetrigger = eventNotFoundThenRetrigger
module.exports.messageFinishedBridging = messageFinishedBridging
module.exports.pauseChanges = pauseChanges
