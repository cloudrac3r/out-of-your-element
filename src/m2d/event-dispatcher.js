// @ts-check

/*
 * Grab Matrix events we care about, check them, and bridge them.
 */

const util = require("util")
const Ty = require("../types")
const {discord, db, sync, as, select} = require("../passthrough")

/** @type {import("./actions/send-event")} */
const sendEvent = sync.require("./actions/send-event")
/** @type {import("./actions/add-reaction")} */
const addReaction = sync.require("./actions/add-reaction")
/** @type {import("./actions/redact")} */
const redact = sync.require("./actions/redact")
/** @type {import("./actions/update-pins")}) */
const updatePins = sync.require("./actions/update-pins")
/** @type {import("../matrix/matrix-command-handler")} */
const matrixCommandHandler = sync.require("../matrix/matrix-command-handler")
/** @type {import("./converters/utils")} */
const utils = sync.require("./converters/utils")
/** @type {import("../matrix/api")}) */
const api = sync.require("../matrix/api")
const {reg} = require("../matrix/read-registration")

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

/**
 * @param {Ty.Event.Outer<Ty.Event.M_Reaction>} reactionEvent
 */
async function onRetryReactionAdd(reactionEvent) {
	const roomID = reactionEvent.room_id
	const event = await api.getEvent(roomID, reactionEvent.content["m.relates_to"]?.event_id)

	// Check that it's a real error from OOYE
	const error = event.content["moe.cadence.ooye.error"]
	if (event.sender !== `@${reg.sender_localpart}:${reg.ooye.server_name}` || !error) return

	// To stop people injecting misleading messages, the reaction needs to come from either the original sender or a room moderator
	if (reactionEvent.sender !== event.sender) {
		// Check if it's a room moderator
		const powerLevelsStateContent = await api.getStateEvent(roomID, "m.room.power_levels", "")
		const powerLevel = powerLevelsStateContent.users?.[reactionEvent.sender] || 0
		if (powerLevel < 50) return
	}

	// Retry
	if (error.source === "matrix") {
		as.emit(`type:${error.payload.type}`, error.payload)
	} else if (error.source === "discord") {
		discord.cloud.emit("event", error.payload)
	}

	// Redact the error to stop people from executing multiple retries
	api.redactEvent(roomID, event.event_id)
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
	await api.ackEvent(event)
}))

sync.addTemporaryListener(as, "type:m.sticker", guard("m.sticker",
/**
 * @param {Ty.Event.Outer_M_Sticker} event it is a m.sticker because that's what this listener is filtering for
 */
async event => {
	if (utils.eventSenderIsFromDiscord(event.sender)) return
	const messageResponses = await sendEvent.sendEvent(event)
	await api.ackEvent(event)
}))

sync.addTemporaryListener(as, "type:m.reaction", guard("m.reaction",
/**
 * @param {Ty.Event.Outer<Ty.Event.M_Reaction>} event it is a m.reaction because that's what this listener is filtering for
 */
async event => {
	if (utils.eventSenderIsFromDiscord(event.sender)) return
	if (event.content["m.relates_to"].key === "🔁") {
		// Try to bridge a failed event again?
		await onRetryReactionAdd(event)
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
	await api.ackEvent(event)
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

sync.addTemporaryListener(as, "type:m.room.pinned_events", guard("m.room.pinned_events",
/**
 * @param {Ty.Event.StateOuter<Ty.Event.M_Room_PinnedEvents>} event
 */
async event => {
	if (event.state_key !== "") return
	if (utils.eventSenderIsFromDiscord(event.sender)) return
	const pins = event.content.pinned
	if (!Array.isArray(pins)) return
	let prev = event.unsigned?.prev_content?.pinned
	if (!Array.isArray(prev)) {
		if (pins.length === 1) {
			/*
				In edge cases, prev_content isn't guaranteed to be provided by the server.
				If prev_content is missing, we can't diff. Better safe than sorry: we'd like to ignore the change rather than wiping the whole channel's pins on Discord.
				However, that would mean if the first ever pin came from Matrix-side, it would be ignored, because there would be no prev_content (it's the first pinned event!)
				So to handle that edge case, we assume that if there's exactly 1 entry in `pinned`, this is the first ever pin and it should go through.
			*/
			prev = []
		} else {
			return
		}
	}

	await updatePins.updatePins(pins, prev)
	await api.ackEvent(event)
}))

sync.addTemporaryListener(as, "type:m.room.member", guard("m.room.member",
/**
 * @param {Ty.Event.StateOuter<Ty.Event.M_Room_Member>} event
 */
async event => {
	if (event.state_key[0] !== "@") return
	if (utils.eventSenderIsFromDiscord(event.state_key)) return
	if (event.content.membership === "leave" || event.content.membership === "ban") {
		// Member is gone
		db.prepare("DELETE FROM member_cache WHERE room_id = ? and mxid = ?").run(event.room_id, event.state_key)
	} else {
		// Member is here
		db.prepare("INSERT INTO member_cache (room_id, mxid, displayname, avatar_url) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET displayname = ?, avatar_url = ?")
			.run(
				event.room_id, event.state_key,
				event.content.displayname || null, event.content.avatar_url || null,
				event.content.displayname || null, event.content.avatar_url || null
			)
	}
}))

sync.addTemporaryListener(as, "type:m.room.power_levels", guard("m.room.power_levels",
/**
 * @param {Ty.Event.StateOuter<Ty.Event.M_Power_Levels>} event
 */
async event => {
	if (event.state_key !== "") return
	const existingPower = select("member_cache", "mxid", {room_id: event.room_id}).pluck().all()
	const newPower = event.content.users || {}
	for (const mxid of existingPower) {
		db.prepare("UPDATE member_cache SET power_level = ? WHERE room_id = ? AND mxid = ?").run(newPower[mxid] || 0, event.room_id, mxid)
	}
}))
