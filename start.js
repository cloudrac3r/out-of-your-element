// @ts-check

const sqlite = require("better-sqlite3")
const migrate = require("./src/db/migrate")
const HeatSync = require("heatsync")

const config = require("./config")
const passthrough = require("./src/passthrough")
const db = new sqlite("src/db/ooye.db")

/** @type {import("heatsync").default} */ // @ts-ignore
const sync = new HeatSync()

Object.assign(passthrough, {config, sync, db})

const DiscordClient = require("./src/d2m/discord-client")

const discord = new DiscordClient(config.discordToken, "full")
passthrough.discord = discord

const {as} = require("./src/matrix/appservice")
passthrough.as = as

const orm = sync.require("./src/db/orm")
passthrough.from = orm.from
passthrough.select = orm.select

const power = require("./src/matrix/power.js")
sync.require("./src/m2d/event-dispatcher")

;(async () => {
	await migrate.migrate(db)
	await discord.cloud.connect()
	console.log("Discord gateway started")
	await power.applyPower()

	require("./src/stdin")
})()
