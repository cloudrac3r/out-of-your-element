// @ts-check

const sqlite = require("better-sqlite3")
const db = new sqlite("db/ooye.db", {fileMustExist: true})
db.pragma("journal_mode = wal")
db.close()
