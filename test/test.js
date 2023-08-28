// @ts-check

const fs = require("fs")
const sqlite = require("better-sqlite3")
const HeatSync = require("heatsync")

const config = require("../config")
const passthrough = require("../passthrough")
const db = new sqlite(":memory:")

db.exec(fs.readFileSync("db/ooye-schema.sql", "utf8"))
db.exec(fs.readFileSync("db/ooye-test-data.sql", "utf8"))

const sync = new HeatSync({watchFS: false})

Object.assign(passthrough, { config, sync, db })

const file = sync.require("../matrix/file")
file._actuallyUploadDiscordFileToMxc = function(url, res) { throw new Error(`Not allowed to upload files during testing.\nURL: ${url}`) }

require("../matrix/kstate.test")
require("../matrix/api.test")
require("../matrix/read-registration.test")
require("../matrix/txnid.test")
require("../d2m/converters/message-to-event.test")
require("../d2m/converters/message-to-event.embeds.test")
require("../d2m/converters/edit-to-changes.test")
require("../d2m/converters/thread-to-announcement.test")
require("../d2m/actions/create-room.test")
require("../d2m/converters/user-to-mxid.test")
require("../d2m/actions/register-user.test")
require("../m2d/converters/event-to-message.test")
require("../m2d/converters/utils.test")
