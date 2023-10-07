// @ts-check

const assert = require("assert").strict
const fs = require("fs")
const sqlite = require("better-sqlite3")
const HeatSync = require("heatsync")

const config = require("../config")
const passthrough = require("../passthrough")
const db = new sqlite("db/ooye.db")
const migrate = require("../db/migrate")

const sync = new HeatSync({watchFS: false})

Object.assign(passthrough, { sync, config, db })

const orm = sync.require("../db/orm")
passthrough.from = orm.from
passthrough.select = orm.select

const DiscordClient = require("../d2m/discord-client")
const discord = new DiscordClient(config.discordToken, "no")
passthrough.discord = discord

const api = require("../matrix/api")
const file = require("../matrix/file")
const reg = require("../matrix/read-registration")
const utils = require("../m2d/converters/utils")

;(async () => {
	const mxid = `@${reg.sender_localpart}:${reg.ooye.server_name}`

	// ensure registration is correctly set...
	assert(reg.sender_localpart.startsWith(reg.ooye.namespace_prefix)) // appservice's localpart must be in the namespace it controls
	assert(utils.eventSenderIsFromDiscord(mxid)) // appservice's mxid must be in the namespace it controls
	assert(reg.ooye.server_origin.match(/^https?:\/\//)) // must start with http or https
	assert.notEqual(reg.ooye.server_origin.slice(-1), "/") // must not end in slash
	console.log("✅ Configuration looks good...")

	// database ddl...
	await migrate.migrate(db)

	// add initial rows to database, like adding the bot to sim...
	db.prepare("INSERT OR IGNORE INTO sim (user_id, sim_name, localpart, mxid) VALUES (?, ?, ?, ?)").run("0", reg.sender_localpart.slice(reg.ooye.namespace_prefix.length), reg.sender_localpart, mxid)

	console.log("✅ Database is ready...")

	// ensure homeserver well-known is valid and returns reg.ooye.server_name...

	// upload initial images...
	const avatarUrl = await file.uploadDiscordFileToMxc("https://cadence.moe/friends/out_of_your_element.png")

	// set profile data on discord...
	const avatarImageBuffer = await fetch("https://cadence.moe/friends/out_of_your_element.png").then(res => res.arrayBuffer())
	await discord.snow.user.updateSelf({avatar: "data:image/png;base64," + Buffer.from(avatarImageBuffer).toString("base64")})
	await discord.snow.requestHandler.request(`/applications/@me`, {}, "patch", "json", {description: "Powered by **Out Of Your Element**\nhttps://gitdab.com/cadence/out-of-your-element"})
	console.log("✅ Discord profile updated...")

	// set profile data on homeserver...
	await api.profileSetDisplayname(mxid, "Out Of Your Element")
	await api.profileSetAvatarUrl(mxid, avatarUrl)
	console.log("✅ Matrix profile updated...")

	console.log("Good to go. I hope you enjoy Out Of Your Element.")
	process.exit()
})()
