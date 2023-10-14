// @ts-check

// Trigger the database migration flow and exit after committing.
// You can use this to run migrations locally and check the result using sqlitebrowser.

const sqlite = require("better-sqlite3")

const config = require("../config")
const passthrough = require("../passthrough")
const db = new sqlite("db/ooye.db")
const migrate = require("../db/migrate")

Object.assign(passthrough, {config, db })

migrate.migrate(db)
