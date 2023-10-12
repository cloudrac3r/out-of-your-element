// @ts-check

/*
 * Grab Matrix events we care about, check them, and bridge them.
 */

const util = require("util")
const Ty = require("../types")
const {discord, db, sync, as} = require("../passthrough")

/** @type {import("./actions/send-event")} */
const sendEvent = sync.require("./actions/send-event")
/** @type {import("./actions/add-reaction")} */
const addReaction = sync.require("./actions/add-reaction")
/** @type {import("./actions/redact")} */
const redact = sync.require("./actions/redact")
/** @type {import("../matrix/matrix-command-handler")} */
const matrixCommandHandler = sync.require("../matrix/matrix-command-handler")
/** @type {import("./converters/utils")} */
const utils = sync.require("./converters/utils")
/** @type {import("../matrix/api")}) */
const api = sync.require("../matrix/api")
/** @type {import("../matrix/read-registration")}) */
const reg = sync.require("../matrix/read-registration")

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
					+ `<br><details><summary>Error trace</summary>`
					+ `<pre>${stackLines.join("\n")}</pre></details>`
					+ `<details><summary>Original payload</summary>`
					+ `<pre>${util.inspect(event, false, 4, false)}</pre></details>`,
				"moe.cadence.ooye.error": {
					source: "matrix",
					payload: event
				},
				"m.mentions": {
					user_ids: ["@cadence:cadence.moe"]
				}
			})
		}
	}
}

async function retry(roomID, eventID) {
	const event = await api.getEvent(roomID, eventID)
	const error = event.content["moe.cadence.ooye.error"]
	if (event.sender !== `@${reg.sender_localpart}:${reg.ooye.server_name}` || !error) return
	if (error.source === "matrix") {
		as.emit("type:" + error.payload.type, error.payload)
	} else if (error.source === "discord") {
		discord.cloud.emit("event", error.payload)
	}
}

sync.addTemporaryListener(as, "type:m.room.message", guard("m.room.message",
/**
 * @param {Ty.Event.Outer_M_Room_Message | Ty.Event.Outer_M_Room_Message_File} event it is a m.room.message because that's what this listener is filtering for
 */
async event => {
	if (utils.eventSenderIsFromDiscord(event.sender)) return
	const messageResponses = await sendEvent.sendEvent(event)
	if (event.type === "m.room.message" && event.content.msgtype === "m.text") {
		// @ts-ignore
		await matrixCommandHandler.execute(event)
	}
}))

sync.addTemporaryListener(as, "type:m.sticker", guard("m.sticker",
/**
 * @param {Ty.Event.Outer_M_Sticker} event it is a m.sticker because that's what this listener is filtering for
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
	if (event.content["m.relates_to"].key === "🔁") {
		// Try to bridge a failed event again?
		await retry(event.room_id, event.content["m.relates_to"].event_id)
	} else {
		matrixCommandHandler.onReactionAdd(event)
		await addReaction.addReaction(event)
	}
}))

sync.addTemporaryListener(as, "type:m.room.redaction", guard("m.room.redaction",
/**
 * @param {Ty.Event.Outer_M_Room_Redaction} event it is a m.room.redaction because that's what this listener is filtering for
 */
async event => {
	if (utils.eventSenderIsFromDiscord(event.sender)) return
	await redact.handle(event)
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
	if (utils.eventSenderIsFromDiscord(event.state_key)) return
	db.prepare("REPLACE INTO member_cache (room_id, mxid, displayname, avatar_url) VALUES (?, ?, ?, ?)").run(event.room_id, event.state_key, event.content.displayname || null, event.content.avatar_url || null)
}))
