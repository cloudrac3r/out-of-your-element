// @ts-check

const sqlite = require("better-sqlite3")
const HeatSync = require("heatsync")

const config = require("../config")
const passthrough = require("../passthrough")
const db = new sqlite("db/ooye.db")

// @ts-ignore
const sync = new HeatSync({watchFS: false})

Object.assign(passthrough, { config, sync, db })

require("../d2m/actions/create-room.test")
require("../d2m/converters/user-to-mxid.test")