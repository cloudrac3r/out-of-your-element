#!/usr/bin/env node
// @ts-check

const sqlite = require("better-sqlite3")
const HeatSync = require("heatsync")

const passthrough = require("../src/passthrough")
const db = new sqlite("ooye.db")

const sync = new HeatSync({watchFS: false})

Object.assign(passthrough, {sync, db})

const api = require("../src/matrix/api")

/** @type {{event_id: string, room_id: string, event_type: string}[]} */ // @ts-ignore
const rows = db.prepare("SELECT event_id, room_id, event_type FROM event_message INNER JOIN message_channel USING (message_id) INNER JOIN channel_room USING (channel_id)").all()

const preparedUpdate = db.prepare("UPDATE event_message SET event_type = ?, event_subtype = ? WHERE event_id = ?")

;(async () => {
	for (const row of rows) {
		if (row.event_type == null) {
			const event = await api.getEvent(row.room_id, row.event_id)
			const type = event.type
			const subtype = event.content.msgtype || null
			preparedUpdate.run(type, subtype, row.event_id)
			console.log(`Updated ${row.event_id} -> ${type} + ${subtype}`)
		}
	}
})()
