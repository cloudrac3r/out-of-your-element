// @ts-check

const sqlite = require("better-sqlite3")
const HeatSync = require("heatsync")

const config = require("./config")
const passthrough = require("./passthrough")
const db = new sqlite("db/ooye.db")

const sync = new HeatSync()

Object.assign(passthrough, {config, sync, db})

const DiscordClient = require("./d2m/discord-client")

const discord = new DiscordClient(config.discordToken, "full")
passthrough.discord = discord

const as = require("./m2d/appservice")
passthrough.as = as

sync.require("./m2d/event-dispatcher")

discord.snow.requestHandler.on("requestError", data => {
	console.error("request error", data)
})

;(async () => {
	await discord.cloud.connect()
	console.log("Discord gateway started")

	require("./stdin")
})()
