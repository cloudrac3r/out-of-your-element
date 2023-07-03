// @ts-check

/**
 * Grab Matrix events we care about, check them, and bridge them.
 */

const assert = require("assert").strict
const {sync, as} = require("../passthrough")
const reg = require("../matrix/read-registration")
/** @type {import("./actions/send-event")} */
const sendEvent = sync.require("./actions/send-event")

const userRegex = reg.namespaces.users.map(u => new RegExp(u.regex))
/**
 * Determine whether an event is the bridged representation of a discord message.
 * Such messages shouldn't be bridged again.
 * @param {import("../types").Event.Outer<any>} event
 */
function eventOriginatedFromDiscord(event) {
	if (
		// If it's from a user in the bridge's namespace...
		userRegex.some(x => event.sender.match(x))
		// ...not counting the appservice's own user...
		&& !event.sender.startsWith(`@${reg.sender_localpart}:`)
	) {
		// ...then it originated from discord
		return true
	}

	return false
}

sync.addTemporaryListener(as, "type:m.room.message", event => {
	console.log(event)
	if (eventOriginatedFromDiscord(event)) return
	const messageResponses = sendEvent.sendEvent(event)
})
