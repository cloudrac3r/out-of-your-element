// @ts-check

const fs = require("fs")
const {join} = require("path")
const sqlite = require("better-sqlite3")
const migrate = require("../db/migrate")
const HeatSync = require("heatsync")
const {test} = require("supertape")
const data = require("./data")

const config = require("../config")
const passthrough = require("../passthrough")
const db = new sqlite(":memory:")

const reg = require("../matrix/read-registration")
reg.ooye.server_origin = "https://matrix.cadence.moe" // so that tests will pass even when hard-coded
reg.ooye.invite = ["@test_auto_invite:example.org"]

const sync = new HeatSync({watchFS: false})

const discord = {
	guilds: new Map([
		[data.guild.general.id, data.guild.general]
	]),
	application: {
		id: "684280192553844747"
	}
}

Object.assign(passthrough, { discord, config, sync, db })

const orm = sync.require("../db/orm")
passthrough.from = orm.from
passthrough.select = orm.select

const file = sync.require("../matrix/file")
file._actuallyUploadDiscordFileToMxc = function(url, res) { throw new Error(`Not allowed to upload files during testing.\nURL: ${url}`) }

;(async () => {
	const p = migrate.migrate(db)
	test("migrate: migration works", async t => {
		await p
		t.pass("it did not throw an error")
	})
	await p
	db.exec(fs.readFileSync(join(__dirname, "ooye-test-data.sql"), "utf8"))
	require("../db/orm.test")
	require("../matrix/kstate.test")
	require("../matrix/api.test")
	require("../matrix/file.test")
	require("../matrix/read-registration.test")
	require("../matrix/txnid.test")
	require("../d2m/actions/create-room.test")
	require("../d2m/actions/register-user.test")
	require("../d2m/converters/edit-to-changes.test")
	require("../d2m/converters/emoji-to-key.test")
	require("../d2m/converters/message-to-event.test")
	require("../d2m/converters/message-to-event.embeds.test")
	require("../d2m/converters/pins-to-list.test")
	require("../d2m/converters/remove-reaction.test")
	require("../d2m/converters/thread-to-announcement.test")
	require("../d2m/converters/user-to-mxid.test")
	require("../m2d/converters/event-to-message.test")
	require("../m2d/converters/utils.test")
})()
