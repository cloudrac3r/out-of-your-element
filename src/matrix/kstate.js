// @ts-check

const assert = require("assert").strict
const mixin = require("@cloudrac3r/mixin-deep")
const {isDeepStrictEqual} = require("util")

const passthrough = require("../passthrough")
const {sync} = passthrough
/** @type {import("./file")} */
const file = sync.require("./file")
/** @type {import("./api")} */
const api = sync.require("./api")
/** @type {import("../m2d/converters/utils")} */
const utils = sync.require("../m2d/converters/utils")

/** Mutates the input. Not recursive - can only include or exclude entire state events. */
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

/** Mutates the input. Works recursively through object tree. */
async function kstateUploadMxc(obj) {
	const promises = []
	function inner(obj) {
		for (const [k, v] of Object.entries(obj)) {
			if (v == null || typeof v !== "object") continue

			if (v.$url) {
				promises.push(
					file.uploadDiscordFileToMxc(v.$url)
					.then(mxc => obj[k] = mxc)
				)
			}

			inner(v)
		}
	}
	inner(obj)
	await Promise.all(promises)
	return obj
}

/** Automatically strips conditionals and uploads URLs to mxc. m.room.create is removed. */
async function kstateToState(kstate) {
	const events = []
	kstateStripConditionals(kstate)
	await kstateUploadMxc(kstate)
	for (const [k, content] of Object.entries(kstate)) {
		if (k === "m.room.create/") continue
		const slashIndex = k.indexOf("/")
		assert(slashIndex > 0)
		const type = k.slice(0, slashIndex)
		const state_key = k.slice(slashIndex + 1)
		events.push({type, state_key, content})
	}
	return events
}

/** Extracts m.room.create for use in room creation_content. */
function kstateToCreationContent(kstate) {
	return kstate["m.room.create/"] || {}
}

/**
 * @param {import("../types").Event.StateOuter<any>[]} events
 * @returns {any}
 */
function stateToKState(events) {
	const kstate = {}
	for (const event of events) {
		kstate[event.type + "/" + event.state_key] = event.content

		// need to remember m.room.create sender for later...
		if (event.type === "m.room.create" && event.state_key === "") {
			kstate["m.room.create/outer"] = event
		}
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
				const mixedTarget = mixin({}, actual[key], target[key])
			if (!isDeepStrictEqual(actual[key], mixedTarget)) {
				// they differ. use the newly prepared object as the diff.
				// if the diff includes users, it needs to be cleaned wrt room version 12
				if (target[key].users && Object.keys(target[key].users).length > 0) {
					if (!("m.room.create/" in actual)) throw new Error(`want to apply a power levels diff, but original m.room.create/ is missing\nstarted with:  ${JSON.stringify(actual)}\nwant to apply: ${JSON.stringify(target)}`)
					if (!("m.room.create/outer" in actual)) throw new Error(`want to apply a power levels diff, but original m.room.create/outer is missing\nstarted with:  ${JSON.stringify(actual)}\nwant to apply: ${JSON.stringify(target)}`)
					utils.removeCreatorsFromPowerLevels(actual["m.room.create/outer"], mixedTarget)
				}
				diff[key] = mixedTarget
			}

		} else if (key === "m.room.create/") {
			// can't be modified - only for kstateToCreationContent

		} else if (key === "m.room.topic/") {
			// synapse generates different m.room.topic events on original creation
			// https://github.com/element-hq/synapse/blob/0f2b29511fd88d1dc2278f41fd6e4e2f2989fcb7/synapse/handlers/room.py#L1729
			// diff the `topic` to determine change
			if (!(key in actual) || actual[key].topic !== target[key].topic) {
				diff[key] = target[key]
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

/* c8 ignore start */

/**
 * Async because it gets all room state from the homeserver.
 * @param {string} roomID
 */
async function roomToKState(roomID) {
	const root = await api.getAllState(roomID)
	return stateToKState(root)
}

/**
 * @param {string} roomID
 * @param {any} kstate
 */
async function applyKStateDiffToRoom(roomID, kstate) {
	const events = await kstateToState(kstate)
	return Promise.all(events.map(({type, state_key, content}) =>
		api.sendState(roomID, type, state_key, content)
	))
}

module.exports.kstateStripConditionals = kstateStripConditionals
module.exports.kstateUploadMxc = kstateUploadMxc
module.exports.kstateToState = kstateToState
module.exports.kstateToCreationContent = kstateToCreationContent
module.exports.stateToKState = stateToKState
module.exports.diffKState = diffKState
module.exports.roomToKState = roomToKState
module.exports.applyKStateDiffToRoom = applyKStateDiffToRoom
