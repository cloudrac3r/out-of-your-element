#!/usr/bin/env node
// @ts-check

console.log("-=- This script is experimental. It WILL mess up the room history on Matrix. -=-")
console.log()

const {channel: channelID} = require("minimist")(process.argv.slice(2), {string: ["channel"]})
if (!channelID) {
	console.error("Usage: ./scripts/backfill.js --channel=<channel id here>")
	process.exit(1)
}

const assert = require("assert/strict")
const sqlite = require("better-sqlite3")
const backfill = new sqlite("scripts/backfill.db")
backfill.prepare("CREATE TABLE IF NOT EXISTS backfill (channel_id TEXT NOT NULL, message_id INTEGER NOT NULL, PRIMARY KEY (channel_id, message_id))").run()

const HeatSync = require("heatsync")

const {reg} = require("../src/matrix/read-registration")
const passthrough = require("../src/passthrough")

const sync = new HeatSync({watchFS: false})
const db = new sqlite("ooye.db")
Object.assign(passthrough, {sync, db})

const DiscordClient = require("../src/d2m/discord-client")

const discord = new DiscordClient(reg.ooye.discord_token, "half")
passthrough.discord = discord

const orm = sync.require("../src/db/orm")
passthrough.from = orm.from
passthrough.select = orm.select

/** @type {import("../src/d2m/event-dispatcher")}*/
const eventDispatcher = sync.require("../src/d2m/event-dispatcher")

const roomID = passthrough.select("channel_room", "room_id", {channel_id: channelID}).pluck().get()
if (!roomID) {
	console.error("Please choose a channel that's already bridged.")
	process.exit(1)
}

;(async () => {
	await discord.cloud.connect()
	console.log("Connected, waiting for data about requested channel...")

	discord.cloud.on("event", event)
})()

const preparedInsert = backfill.prepare("INSERT INTO backfill (channel_id, message_id) VALUES (?, ?)")

async function event(event) {
	if (event.t !== "GUILD_CREATE") return
	const channel = event.d.channels.find(c => c.id === channelID)
	if (!channel) return
	const guild_id = event.d.id

	let last = backfill.prepare("SELECT cast(max(message_id) as TEXT) FROM backfill WHERE channel_id = ?").pluck().get(channelID) || "0"
	console.log(`OK, processing messages for #${channel.name}, continuing from ${last}`)

	while (last) {
		const messages = await discord.snow.channel.getChannelMessages(channelID, {limit: 50, after: String(last)})
		messages.reverse() // More recent messages come first -> More recent messages come last
		for (const message of messages) {
			const simulatedGatewayDispatchData = {
				guild_id,
				backfill: true,
				...message
			}
			await eventDispatcher.onMessageCreate(discord, simulatedGatewayDispatchData)
			preparedInsert.run(channelID, message.id)
		}
		last = messages.at(-1)?.id
	}

	process.exit()
}
