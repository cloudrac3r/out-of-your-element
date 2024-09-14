#!/usr/bin/env node
// @ts-check

const sqlite = require("better-sqlite3")
const db = new sqlite("ooye.db", {fileMustExist: true})
db.pragma("journal_mode = wal")
db.close()
