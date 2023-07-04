// @ts-check

/**
 * Grab Matrix events we care about, check them, and bridge them.
 */

const Ty = require("../types")
const {sync, as} = require("../passthrough")

/** @type {import("./actions/send-event")} */
const sendEvent = sync.require("./actions/send-event")
/** @type {import("./actions/add-reaction")} */
const addReaction = sync.require("./actions/add-reaction")
/** @type {import("./converters/utils")} */
const utils = sync.require("./converters/utils")

sync.addTemporaryListener(as, "type:m.room.message",
/**
 * @param {Ty.Event.Outer<Ty.Event.M_Room_Message>} event it is a m.room.message because that's what this listener is filtering for
 */
async event => {
	if (utils.eventSenderIsFromDiscord(event.sender)) return
	const messageResponses = await sendEvent.sendEvent(event)
})

sync.addTemporaryListener(as, "type:m.reaction",
/**
 * @param {Ty.Event.Outer<Ty.Event.M_Reaction>} event it is a m.reaction because that's what this listener is filtering for
 */
async event => {
	if (utils.eventSenderIsFromDiscord(event.sender)) return
	await addReaction.addReaction(event)
})
