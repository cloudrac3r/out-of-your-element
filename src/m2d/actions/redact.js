// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const Ty = require("../../types")

const passthrough = require("../../passthrough")
const {discord, as, sync, db, select, from} = passthrough
/** @type {import("../../matrix/utils")} */
const utils = sync.require("../../matrix/utils")
/** @type {import("../../d2m/actions/retrigger")} */
const retrigger = sync.require("../../d2m/actions/retrigger")

/**
 * @param {Ty.Event.Outer_M_Room_Redaction} event
 */
async function deleteMessage(event) {
	const rows = from("event_message").join("message_room", "message_id").join("historical_channel_room", "historical_room_index")
		.select("reference_channel_id", "message_id").where({event_id: event.redacts}).all()
	if (!rows.length) return
	for (const row of rows) {
		await discord.snow.channel.deleteMessage(row.reference_channel_id, row.message_id, event.content.reason)
		db.prepare("DELETE FROM event_message WHERE message_id = ?").run(row.message_id)
	}
	db.prepare("DELETE FROM message_room WHERE message_id = ?").run(rows[0].message_id)
}

/**
 * @param {Ty.Event.Outer_M_Room_Redaction} event
 */
async function suppressEmbeds(event) {
	const rows = from("event_message").join("message_room", "message_id").join("historical_channel_room", "historical_room_index")
		.select("reference_channel_id", "message_id").where({event_id: event.redacts}).all()
	if (!rows.length) return
	db.prepare("DELETE FROM event_message WHERE event_id = ?").run(event.redacts)
	for (const row of rows) {
		await discord.snow.channel.editMessage(row.reference_channel_id, row.message_id, {flags: DiscordTypes.MessageFlags.SuppressEmbeds})
	}
}

/**
 * @param {Ty.Event.Outer_M_Room_Redaction} event
 */
async function removeReaction(event) {
	const hash = utils.getEventIDHash(event.redacts)
	const row = from("reaction").join("message_room", "message_id").join("historical_channel_room", "historical_room_index")
		.select("reference_channel_id", "message_id", "encoded_emoji").where({hashed_event_id: hash}).get()
	if (!row) return
	await discord.snow.channel.deleteReactionSelf(row.reference_channel_id, row.message_id, row.encoded_emoji)
	db.prepare("DELETE FROM reaction WHERE hashed_event_id = ?").run(hash)
}

/**
 * Try everything that could possibly be redacted.
 * @param {Ty.Event.Outer_M_Room_Redaction} event
 */
async function handle(event) {
	// If this is for removing a reaction, try it
	await removeReaction(event)

	// Or, it might be for removing a message or suppressing embeds. But to do that, the message needs to be bridged first.
	if (retrigger.eventNotFoundThenRetrigger(event.redacts, as.emit.bind(as, "type:m.room.redaction", event))) return

	const row = select("event_message", ["event_type", "event_subtype", "part"], {event_id: event.redacts}).get()
	if (row && row.event_type === "m.room.message" && row.event_subtype === "m.notice" && row.part === 1) {
		await suppressEmbeds(event)
	} else {
		await deleteMessage(event)
	}
}

module.exports.handle = handle
