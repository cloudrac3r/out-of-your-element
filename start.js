// @ts-check

const sqlite = require("better-sqlite3")
const migrate = require("./db/migrate")
const HeatSync = require("heatsync")

const config = require("./config")
const passthrough = require("./passthrough")
const db = new sqlite("db/ooye.db")

/** @type {import("heatsync").default} */ // @ts-ignore
const sync = new HeatSync()

Object.assign(passthrough, {config, sync, db})

const DiscordClient = require("./d2m/discord-client")

const discord = new DiscordClient(config.discordToken, "full")
passthrough.discord = discord

const {as} = require("./matrix/appservice")
passthrough.as = as

const orm = sync.require("./db/orm")
passthrough.from = orm.from
passthrough.select = orm.select

const power = require("./matrix/power.js")
sync.require("./m2d/event-dispatcher")

;(async () => {
	await migrate.migrate(db)
	await discord.cloud.connect()
	console.log("Discord gateway started")
	await power.applyPower()

	require("./stdin")
})()
