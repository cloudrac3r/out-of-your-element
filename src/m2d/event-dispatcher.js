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
/** @type {import("../d2m/actions/create-room")} */
const createRoom = sync.require("../d2m/actions/create-room")
const {reg} = require("../matrix/read-registration")

let lastReportedEvent = 0

/**
 * This function is adapted from Evan Kaufman's fantastic work.
 * The original function and my adapted function are both MIT licensed.
 * @url https://github.com/EvanK/npm-loggable-error/
 * @param {number} [depth]
 * @returns {string}
*/
function stringifyErrorStack(err, depth = 0) {
	let collapsed = " ".repeat(depth);
	if (!(err instanceof Error)) {
		return collapsed + err
	}

	// add full stack trace if one exists, otherwise convert to string
	let stackLines = String(err?.stack ?? err).replace(/^/gm, " ".repeat(depth)).trim().split("\n")
	let cloudstormLine = stackLines.findIndex(l => l.includes("/node_modules/cloudstorm/"))
	if (cloudstormLine !== -1) {
		stackLines = stackLines.slice(0, cloudstormLine - 2)
	}
	collapsed += stackLines.join("\n")

	const props = Object.getOwnPropertyNames(err).filter(p => !["message", "stack"].includes(p))

	// only break into object notation if we have additional props to dump
	if (props.length) {
		const dedent = " ".repeat(depth);
		const indent = " ".repeat(depth + 2);

		collapsed += " {\n";

		// loop and print each (indented) prop name
		for (let property of props) {
			collapsed += `${indent}[${property}]: `;

			// if another error object, stringify it too
			if (err[property] instanceof Error) {
				collapsed += stringifyErrorStack(err[property], depth + 2).trimStart();
			}
			// otherwise stringify as JSON
			else {
				collapsed += JSON.stringify(err[property]);
			}

			collapsed += "\n";
		}

		collapsed += `${dedent}}\n`;
	}

	return collapsed;
}

/**
 * @param {string} roomID
 * @param {"Discord" | "Matrix"} source
 * @param {any} type
 * @param {any} e
 * @param {any} payload
 */
async function sendError(roomID, source, type, e, payload) {
	console.error(`Error while processing a ${type} ${source} event:`)
	console.error(e)
	console.dir(payload, {depth: null})

	if (Date.now() - lastReportedEvent < 5000) return null
	lastReportedEvent = Date.now()

	let errorIntroLine = e.toString()
	if (e.cause) {
		errorIntroLine += ` (cause: ${e.cause})`
	}

	const builder = new utils.MatrixStringBuilder()

	const cloudflareErrorTitle = errorIntroLine.match(/<!DOCTYPE html>.*?<title>discord\.com \| ([^<]*)<\/title>/s)?.[1]
	if (cloudflareErrorTitle) {
		builder.addLine(
			`\u26a0 Matrix event not delivered to Discord. Discord might be down right now. Cloudflare error: ${cloudflareErrorTitle}`,
			`\u26a0 <strong>Matrix event not delivered to Discord</strong><br>Discord might be down right now. Cloudflare error: ${cloudflareErrorTitle}`
		)
	} else {
		// What
		const what = source === "Discord" ? "Bridged event from Discord not delivered" : "Matrix event not delivered to Discord"
		builder.addLine(`\u26a0 ${what}`, `\u26a0 <strong>${what}</strong>`)

		// Who
		builder.addLine(`Event type: ${type}`)

		// Why
		builder.addLine(errorIntroLine)

		// Where
		const stack = stringifyErrorStack(e)
		builder.addLine(`Error trace:\n${stack}`, `<details><summary>Error trace</summary><pre>${stack}</pre></details>`)

		// How
		builder.addLine("", `<details><summary>Original payload</summary><pre>${util.inspect(payload, false, 4, false)}</pre></details>`)
	}

	// Send
	try {
		await api.sendEvent(roomID, "m.room.message", {
			...builder.get(),
			"moe.cadence.ooye.error": {
				source: source.toLowerCase(),
				payload
			},
			"m.mentions": {
				user_ids: ["@cadence:cadence.moe"]
			}
		})
	} catch (e) {}
}

function guard(type, fn) {
	return async function(event, ...args) {
		try {
			return await fn(event, ...args)
		} catch (e) {
			await sendError(event.room_id, "Matrix", type, e, event)
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
	await api.redactEvent(roomID, event.event_id)
}

sync.addTemporaryListener(as, "type:m.room.message", guard("m.room.message",
/**
 * @param {Ty.Event.Outer_M_Room_Message | Ty.Event.Outer_M_Room_Message_File} event it is a m.room.message because that's what this listener is filtering for
 */
async event => {
	if (utils.eventSenderIsFromDiscord(event.sender)) return
	const messageResponses = await sendEvent.sendEvent(event)
	if (!messageResponses.length) return
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

sync.addTemporaryListener(as, "type:m.room.topic", guard("m.room.topic",
/**
 * @param {Ty.Event.StateOuter<Ty.Event.M_Room_Topic>} event
 */
async event => {
	if (event.state_key !== "") return
	if (utils.eventSenderIsFromDiscord(event.sender)) return
	const customTopic = +!!event.content.topic
	const row = select("channel_room", ["channel_id", "custom_topic"], {room_id: event.room_id}).get()
	if (!row) return
	if (customTopic !== row.custom_topic) db.prepare("UPDATE channel_room SET custom_topic = ? WHERE channel_id = ?").run(customTopic, row.channel_id)
	if (!customTopic) await createRoom.syncRoom(row.channel_id) // if it's cleared we should reset it to whatever's on discord
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

function getFromInviteRoomState(inviteRoomState, nskey, key) {
	if (!Array.isArray(inviteRoomState)) return null
	for (const event of inviteRoomState) {
		if (event.type === nskey && event.state_key === "") {
			return event.content[key]
		}
	}
	return null
}

sync.addTemporaryListener(as, "type:m.space.child", guard("m.space.child",
/**
 * @param {Ty.Event.StateOuter<Ty.Event.M_Space_Child>} event
 */
async event => {
	if (Array.isArray(event.content.via) && event.content.via.length) { // space child is being added
		await api.joinRoom(event.state_key).catch(() => {}) // try to join if able, it's okay if it doesn't want, bot will still respond to invites
	}
}))

sync.addTemporaryListener(as, "type:m.room.member", guard("m.room.member",
/**
 * @param {Ty.Event.StateOuter<Ty.Event.M_Room_Member>} event
 */
async event => {
	if (event.state_key[0] !== "@") return

	if (event.content.membership === "invite" && event.state_key === `@${reg.sender_localpart}:${reg.ooye.server_name}`) {
		// We were invited to a room. We should join, and register the invite details for future reference in web.
		const name = getFromInviteRoomState(event.unsigned?.invite_room_state, "m.room.name", "name")
		const topic = getFromInviteRoomState(event.unsigned?.invite_room_state, "m.room.topic", "topic")
		const avatar = getFromInviteRoomState(event.unsigned?.invite_room_state, "m.room.avatar", "url")
		const creationType = getFromInviteRoomState(event.unsigned?.invite_room_state, "m.room.create", "type")
		if (!name) return await api.leaveRoomWithReason(event.room_id, "Please only invite me to rooms that have a name/avatar set. Update the room details and reinvite!")
		await api.joinRoom(event.room_id)
		db.prepare("INSERT OR IGNORE INTO invite (mxid, room_id, type, name, topic, avatar) VALUES (?, ?, ?, ?, ?, ?)").run(event.sender, event.room_id, creationType, name, topic, avatar)
		if (avatar) utils.getPublicUrlForMxc(avatar) // make sure it's available in the media_proxy allowed URLs
	}

	if (utils.eventSenderIsFromDiscord(event.state_key)) return

	if (event.content.membership === "leave" || event.content.membership === "ban") {
		// Member is gone
		db.prepare("DELETE FROM member_cache WHERE room_id = ? and mxid = ?").run(event.room_id, event.state_key)

		// Unregister room's use as a direct chat if the bot itself left
		const bot = `@${reg.sender_localpart}:${reg.ooye.server_name}`
		if (event.state_key === bot) {
			db.prepare("DELETE FROM direct WHERE room_id = ?").run(event.room_id)
		}
	}

	const exists = select("channel_room", "room_id", {room_id: event.room_id}) ?? select("guild_space", "space_id", {space_id: event.room_id})
	if (!exists) return // don't cache members in unbridged rooms

	// Member is here
	let powerLevel = 0
	try {
		/** @type {Ty.Event.M_Power_Levels} */
		const powerLevelsEvent = await api.getStateEvent(event.room_id, "m.room.power_levels", "")
		powerLevel = powerLevelsEvent.users?.[event.state_key] ?? powerLevelsEvent.users_default ?? 0
	} catch (e) {}
	const displayname = event.content.displayname || null
	const avatar_url = event.content.avatar_url
	db.prepare("INSERT INTO member_cache (room_id, mxid, displayname, avatar_url, power_level) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO UPDATE SET displayname = ?, avatar_url = ?, power_level = ?").run(
		event.room_id, event.state_key,
		displayname, avatar_url, powerLevel,
		displayname, avatar_url, powerLevel
	)
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

module.exports.stringifyErrorStack = stringifyErrorStack
module.exports.sendError = sendError
