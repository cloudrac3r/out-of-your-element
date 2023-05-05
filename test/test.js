// @ts-check

const sqlite = require("better-sqlite3")
const HeatSync = require("heatsync")

const config = require("../config")
const passthrough = require("../passthrough")
const db = new sqlite("db/ooye.db")

// @ts-ignore
const sync = new HeatSync({persistent: false})

Object.assign(passthrough, { config, sync, db })

require("../d2m/actions/create-room.test")
