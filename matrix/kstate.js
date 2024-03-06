// @ts-check

const assert = require("assert").strict
const mixin = require("mixin-deep")
const {isDeepStrictEqual} = require("util")

/** Mutates the input. */
function kstateStripConditionals(kstate) {
	for (const [k, content] of Object.entries(kstate)) {
		// conditional for whether a key is even part of the kstate (doing this declaratively on json is hard, so represent it as a property instead.)
		if ("$if" in content) {
			if (content.$if) delete content.$if
			else delete kstate[k]
		}
	}
	return kstate
}

function kstateToState(kstate) {
	const events = []
	kstateStripConditionals(kstate)
	for (const [k, content] of Object.entries(kstate)) {
		const slashIndex = k.indexOf("/")
		assert(slashIndex > 0)
		const type = k.slice(0, slashIndex)
		const state_key = k.slice(slashIndex + 1)
		events.push({type, state_key, content})
	}
	return events
}

/**
 * @param {import("../types").Event.BaseStateEvent[]} events
 * @returns {any}
 */
function stateToKState(events) {
	const kstate = {}
	for (const event of events) {
		kstate[event.type + "/" + event.state_key] = event.content
	}
	return kstate
}

function diffKState(actual, target) {
	const diff = {}
	// go through each key that it should have
	for (const key of Object.keys(target)) {
		if (!key.includes("/")) throw new Error(`target kstate's key "${key}" does not contain a slash separator; if a blank state_key was intended, add a trailing slash to the kstate key.\ncontext: ${JSON.stringify(target)}`)

		if (key === "m.room.power_levels/") {
			// Special handling for power levels, we want to deep merge the actual and target into the final state.
			if (!(key in actual)) throw new Error(`want to apply a power levels diff, but original power level data is missing\nstarted with:  ${JSON.stringify(actual)}\nwant to apply: ${JSON.stringify(target)}`)
			const temp = mixin({}, actual[key], target[key])
			if (!isDeepStrictEqual(actual[key], temp)) {
				// they differ. use the newly prepared object as the diff.
				diff[key] = temp
			}

		} else if (key in actual) {
			// diff
			if (!isDeepStrictEqual(actual[key], target[key])) {
				// they differ. use the target as the diff.
				diff[key] = target[key]
			}

		} else {
			// not present, needs to be added
			diff[key] = target[key]
		}

		// keys that are missing in "actual" will not be deleted on "target" (no action)
	}
	return diff
}

module.exports.kstateStripConditionals = kstateStripConditionals
module.exports.kstateToState = kstateToState
module.exports.stateToKState = stateToKState
module.exports.diffKState = diffKState
