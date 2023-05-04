// @ts-check

const sqlite = require("better-sqlite3")
const HeatSync = require("heatsync")

const config = require("./config")
const passthrough = require("./passthrough")
const db = new sqlite("db/ooye.db")

const sync = new HeatSync()

Object.assign(passthrough, { config, sync, db })

const DiscordClient = require("./d2m/discord-client")

const discord = new DiscordClient(config.discordToken)
passthrough.discord = discord

;(async () => {
	await discord.cloud.connect()
	console.log("Discord gateway started")

	require("./stdin")
})()

// process.on("unhandledRejection", console.error)
// process.on("uncaughtException", console.error)
