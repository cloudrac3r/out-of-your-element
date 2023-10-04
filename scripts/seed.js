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

Object.assign(passthrough, { config, sync, db })

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

	// database ddl...
	await migrate.migrate(db)

	// ensure homeserver well-known is valid and returns reg.ooye.server_name...

	// upload initial images...
	const avatarUrl = await file.uploadDiscordFileToMxc("https://cadence.moe/friends/out_of_your_element_rev_2.jpg")

	// set profile data on homeserver...
	await api.profileSetDisplayname(mxid, "Out Of Your Element")
	await api.profileSetAvatarUrl(mxid, avatarUrl)

	// add initial rows to database, like adding the bot to sim...
	db.prepare("INSERT INTO sim (user_id, sim_name, localpart, mxid) VALUES (?, ?, ?, ?)").run("0", reg.sender_localpart.slice(reg.ooye.namespace_prefix.length), reg.sender_localpart, mxid)
})()
