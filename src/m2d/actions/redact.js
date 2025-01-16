// @ts-check

const assert = require("assert").strict
const Ty = require("../../types")

const passthrough = require("../../passthrough")
const {discord, sync, db, select, from} = passthrough
/** @type {import("../converters/utils")} */
const utils = sync.require("../converters/utils")

/**
 * @param {Ty.Event.Outer_M_Room_Redaction} event
 */
async function deleteMessage(event) {
	const rows = from("event_message").join("message_channel", "message_id").select("channel_id", "message_id").where({event_id: event.redacts}).all()
	for (const row of rows) {
		db.prepare("DELETE FROM message_channel WHERE message_id = ?").run(row.message_id)
		await discord.snow.channel.deleteMessage(row.channel_id, row.message_id, event.content.reason)
	}
}

/**
 * @param {Ty.Event.Outer_M_Room_Redaction} event
 */
async function removeReaction(event) {
	const hash = utils.getEventIDHash(event.redacts)
	const row = from("reaction").join("message_channel", "message_id").select("channel_id", "message_id", "encoded_emoji").where({hashed_event_id: hash}).get()
	if (!row) return
	await discord.snow.channel.deleteReactionSelf(row.channel_id, row.message_id, row.encoded_emoji)
	db.prepare("DELETE FROM reaction WHERE hashed_event_id = ?").run(hash)
}

/**
 * Try everything that could possibly be redacted.
 * @param {Ty.Event.Outer_M_Room_Redaction} event
 */
async function handle(event) {
	await deleteMessage(event)
	await removeReaction(event)
}

module.exports.handle = handle
