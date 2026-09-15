#!/usr/bin/env node
// @ts-check

const sqlite = require("better-sqlite3")
const migrate = require("../src/db/migrate")
const HeatSync = require("heatsync")

const {reg} = require("../src/matrix/read-registration")
const passthrough = require("../src/passthrough")
const db = new sqlite("ooye.db")

const sync = new HeatSync()

Object.assign(passthrough, {sync, db})

const orm = sync.require("../src/db/orm")
passthrough.from = orm.from
passthrough.select = orm.select

const DiscordClient = require("../src/d2m/discord-client")

const discord = new DiscordClient(reg.ooye.discord_token, "half")
passthrough.discord = discord

const {as} = require("../src/matrix/appservice")
passthrough.as = as

;(async () => {
	await migrate.migrate(db)
	await discord.cloud.connect()
	console.log("Discord gateway started")
	sync.require("../src/web/server")

	discord.cloud.once("ready", () => {
		as.listen()
	})

	require("../src/stdin")
})()
