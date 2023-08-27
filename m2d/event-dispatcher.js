// @ts-check

/*
 * Grab Matrix events we care about, check them, and bridge them.
 */

const util = require("util")
const Ty = require("../types")
const {db, sync, as} = require("../passthrough")

/** @type {import("./actions/send-event")} */
const sendEvent = sync.require("./actions/send-event")
/** @type {import("./actions/add-reaction")} */
const addReaction = sync.require("./actions/add-reaction")
/** @type {import("./converters/utils")} */
const utils = sync.require("./converters/utils")
/** @type {import("../matrix/api")}) */
const api = sync.require("../matrix/api")

let lastReportedEvent = 0

function guard(type, fn) {
	return async function(event, ...args) {
		try {
			return await fn(event, ...args)
		} catch (e) {
			console.error("hit event-dispatcher's error handler with this exception:")
			console.error(e) // TODO: also log errors into a file or into the database, maybe use a library for this? or just wing it?
			console.error(`while handling this ${type} gateway event:`)
			console.dir(event, {depth: null})

			if (Date.now() - lastReportedEvent < 5000) return
			lastReportedEvent = Date.now()

			let stackLines = e.stack.split("\n")
			api.sendEvent(event.room_id, "m.room.message", {
				msgtype: "m.text",
				body: "\u26a0 Matrix event not delivered to Discord. See formatted content for full details.",
				format: "org.matrix.custom.html",
				formatted_body: "\u26a0 <strong>Matrix event not delivered to Discord</strong>"
					+ `<br>Event type: ${type}`
					+ `<br>${e.toString()}`
					+ `<div><details><summary>Error trace</summary>`
					+ `<pre>${stackLines.join("\n")}</pre></details></div>`
					+ `<div><details><summary>Original payload</summary>`
					+ `<pre>${util.inspect(event, false, 4, false)}</pre></details></div>`,
				"m.mentions": {
					user_ids: ["@cadence:cadence.moe"]
				}
			})
		}
	}
}

sync.addTemporaryListener(as, "type:m.room.message", guard("m.room.message",
/**
 * @param {Ty.Event.Outer<Ty.Event.M_Room_Message>} event it is a m.room.message because that's what this listener is filtering for
 */
async event => {
	if (utils.eventSenderIsFromDiscord(event.sender)) return
	const messageResponses = await sendEvent.sendEvent(event)
}))

sync.addTemporaryListener(as, "type:m.reaction", guard("m.reaction",
/**
 * @param {Ty.Event.Outer<Ty.Event.M_Reaction>} event it is a m.reaction because that's what this listener is filtering for
 */
async event => {
	if (utils.eventSenderIsFromDiscord(event.sender)) return
	await addReaction.addReaction(event)
}))

sync.addTemporaryListener(as, "type:m.room.avatar", guard("m.room.avatar",
/**
 * @param {Ty.Event.StateOuter<Ty.Event.M_Room_Avatar>} event
 */
async event => {
	if (event.state_key !== "") return
	if (utils.eventSenderIsFromDiscord(event.sender)) return
	const url = event.content.url || null
	db.prepare("UPDATE channel_room SET custom_avatar = ? WHERE room_id = ?").run(url, event.room_id)
}))

sync.addTemporaryListener(as, "type:m.room.name", guard("m.room.name",
/**
 * @param {Ty.Event.StateOuter<Ty.Event.M_Room_Name>} event
 */
async event => {
	if (event.state_key !== "") return
	if (utils.eventSenderIsFromDiscord(event.sender)) return
	const name = event.content.name || null
	db.prepare("UPDATE channel_room SET nick = ? WHERE room_id = ?").run(name, event.room_id)
}))

sync.addTemporaryListener(as, "type:m.room.member", guard("m.room.member",
/**
 * @param {Ty.Event.StateOuter<Ty.Event.M_Room_Member>} event
 */
async event => {
	if (event.state_key[0] !== "@") return
	if (utils.eventSenderIsFromDiscord(event.sender)) return
	db.prepare("REPLACE INTO member_cache (room_id, mxid, displayname, avatar_url) VALUES (?, ?, ?, ?)").run(event.room_id, event.sender, event.content.displayname || null, event.content.avatar_url || null)
}))
