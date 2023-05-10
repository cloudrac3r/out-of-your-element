// @ts-check

const assert = require("assert")
const sqlite = require("better-sqlite3")
const HeatSync = require("heatsync")

const config = require("./config")
const passthrough = require("./passthrough")
const db = new sqlite("db/ooye.db")

const sync = new HeatSync({watchFS: false})

Object.assign(passthrough, { config, sync, db })

const api = require("./matrix/api")
const file = require("./matrix/file")
const reg = require("./matrix/read-registration")

;(async () => {
	// ensure registration is correctly set...

	// test connection to homeserver...

	// upload initial images...
	const avatarUrl = await file.uploadDiscordFileToMxc("https://cadence.moe/friends/out_of_your_element_rev_2.jpg")

	// set profile data on homeserver...
	await api.profileSetDisplayname(`@${reg.sender_localpart}:cadence.moe`, "Out Of Your Element")
	await api.profileSetAvatarUrl(`@${reg.sender_localpart}:cadence.moe`, avatarUrl)

	// database ddl...

	// add initial rows to database, like adding the bot to sim...

})()
