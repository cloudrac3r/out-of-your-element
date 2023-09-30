// @ts-check

const sqlite = require("better-sqlite3")
const migrate = require("./db/migrate")
const HeatSync = require("heatsync")

const config = require("./config")
const passthrough = require("./passthrough")
const db = new sqlite("db/ooye.db")

const sync = new HeatSync()

Object.assign(passthrough, {config, sync, db})

const DiscordClient = require("./d2m/discord-client")

const discord = new DiscordClient(config.discordToken, "full")
passthrough.discord = discord

const as = require("./matrix/appservice")
passthrough.as = as

const orm = sync.require("./db/orm")
passthrough.from = orm.from
passthrough.select = orm.select

sync.require("./m2d/event-dispatcher")

discord.snow.requestHandler.on("requestError", data => {
	console.error("request error", data)
})

;(async () => {
	await migrate.migrate(db)
	await discord.cloud.connect()
	console.log("Discord gateway started")

	require("./stdin")
})()
