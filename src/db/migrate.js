// @ts-check

const fs = require("fs")
const {join} = require("path")

async function migrate(db) {
	let files = fs.readdirSync(join(__dirname, "migrations"))
	files = files.sort()
	db.prepare("CREATE TABLE IF NOT EXISTS migration (filename TEXT NOT NULL, PRIMARY KEY (filename)) WITHOUT ROWID").run()
	/** @type {string} */
	let progress = db.prepare("SELECT * FROM migration").pluck().get()
	if (!progress) {
		progress = ""
		db.prepare("INSERT INTO migration VALUES ('')").run()
	}

	let migrationRan = false

	for (const filename of files) {
		if (progress >= filename) continue
		console.log(`Applying database migration ${filename}`)
		if (filename.endsWith(".sql")) {
			const sql = fs.readFileSync(join(__dirname, "migrations", filename), "utf8")
			db.exec(sql)
		} else if (filename.endsWith(".js")) {
			await require("./" + join("migrations", filename))(db)
		} else {
			continue
		}

		migrationRan = true
		db.transaction(() => {
			db.prepare("DELETE FROM migration").run()
			db.prepare("INSERT INTO migration VALUES (?)").run(filename)
		})()
	}

	if (migrationRan) {
		console.log("Database migrations all done.")
	}

	db.pragma("foreign_keys = on")
}

module.exports.migrate = migrate
