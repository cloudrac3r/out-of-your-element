#!/usr/bin/env node
// @ts-check

// ****
const interestingFields = ["author", "content", "edited_timestamp", "mentions", "attachments", "embeds", "type", "message_reference", "referenced_message", "sticker_items"]
// *****

function fieldToPresenceValue(field) {
	if (field === undefined) return 0
	else if (field === null) return 1
	else if (Array.isArray(field) && field.length === 0) return 10
	else if (typeof field === "object" && Object.keys(field).length === 0) return 20
	else if (field === "") return 30
	else return 99
}

const sqlite = require("better-sqlite3")
const HeatSync = require("heatsync")

const {reg} = require("../src/matrix/read-registration")
const passthrough = require("../src/passthrough")

const sync = new HeatSync({watchFS: false})

Object.assign(passthrough, {sync})

const DiscordClient = require("../src/d2m/discord-client")

const discord = new DiscordClient(reg.ooye.discord_token, "no")
passthrough.discord = discord

;(async () => {
	await discord.cloud.connect()
	console.log("Discord gateway started")

	const f = event => onPacket(discord, event, () => discord.cloud.off("event", f))
	discord.cloud.on("event", f)
})()

const events = new sqlite("scripts/events.db")
const sql = "INSERT INTO update_event (json, " + interestingFields.join(", ") + ") VALUES (" + "?".repeat(interestingFields.length + 1).split("").join(", ") + ")"
console.log(sql)
const prepared = events.prepare(sql)

/** @param {DiscordClient} discord */
function onPacket(discord, event, unsubscribe) {
	if (event.t === "MESSAGE_UPDATE") {
		const data = [JSON.stringify(event.d), ...interestingFields.map(f => fieldToPresenceValue(event.d[f]))]
		console.log(data)
		prepared.run(...data)
	}
}
