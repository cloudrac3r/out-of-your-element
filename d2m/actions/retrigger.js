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

const emitter = new EventEmitter()

/**
 * Due to Eventual Consistency(TM) an update/delete may arrive before the original message arrives
 * (or before the it has finished being bridged to an event).
 * In this case, wait until the original message has finished bridging, then retrigger the passed function.
 * @template {(...args: any) => Promise<any>} T
 * @param {string} messageID
 * @param {T} fn
 * @param {Parameters<T>} rest
 * @returns {boolean} false if the event was found and the function will be ignored, true if the event was not found and the function will be retriggered
 */
function eventNotFoundThenRetrigger(messageID, fn, ...rest) {
	const eventID = select("event_message", "event_id", {message_id: messageID}).pluck().get()
	if (eventID) {
		debugRetrigger(`[retrigger] OK mid <-> eid = ${messageID} <-> ${eventID}`)
		return false // event was found so don't retrigger
	}

	debugRetrigger(`[retrigger] WAIT mid <-> eid = ${messageID} <-> ${eventID}`)
	emitter.addListener(messageID, () => {
		debugRetrigger(`[retrigger] TRIGGER mid = ${messageID}`)
		fn(...rest)
	})
	// if the event never arrives, don't trigger the callback, just clean up
	setTimeout(() => {
		if (emitter.listeners(messageID).length) {
			debugRetrigger(`[retrigger] EXPIRE mid = ${messageID}`)
		}
		emitter.removeAllListeners(messageID)
	}, 60 * 1000) // 1 minute
	return true // event was not found, then retrigger
}

/**
 * Triggers any pending operations that were waiting on the corresponding event ID.
 * @param {string} messageID
 */
function messageFinishedBridging(messageID) {
	if (emitter.listeners(messageID).length) {
		debugRetrigger(`[retrigger] EMIT mid = ${messageID}`)
	}
	emitter.emit(messageID)
}

module.exports.eventNotFoundThenRetrigger = eventNotFoundThenRetrigger
module.exports.messageFinishedBridging = messageFinishedBridging
