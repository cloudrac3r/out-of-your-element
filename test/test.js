// @ts-check

const sqlite = require("better-sqlite3")
const HeatSync = require("heatsync")

const config = require("../config")
const passthrough = require("../passthrough")
const db = new sqlite("db/ooye.db")

const sync = new HeatSync({watchFS: false})

Object.assign(passthrough, { config, sync, db })

require("../matrix/kstate.test")
require("../matrix/api.test")
require("../matrix/read-registration.test")
require("../d2m/converters/message-to-event.test")
require("../d2m/actions/create-room.test")
require("../d2m/converters/user-to-mxid.test")
require("../d2m/actions/register-user.test")
