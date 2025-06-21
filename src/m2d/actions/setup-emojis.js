// @ts-check

const fs = require("fs")
const {join} = require("path")

const passthrough = require("../../passthrough")

const {id} = require("../../../addbot")

async function setupEmojis() {
	const {discord, db} = passthrough
	const emojis = await discord.snow.assets.getAppEmojis(id)
	for (const name of ["L1", "L2"]) {
		const existing = emojis.items.find(e => e.name === name)
		if (existing) {
			db.prepare("REPLACE INTO auto_emoji (name, emoji_id) VALUES (?, ?)").run(existing.name, existing.id)
		} else {
			const filename = join(__dirname, "../../../docs/img", `${name}.png`)
			const data = fs.readFileSync(filename, null)
			const uploaded = await discord.snow.assets.createAppEmoji(id, {name, image: "data:image/png;base64," + data.toString("base64")})
			db.prepare("REPLACE INTO auto_emoji (name, emoji_id) VALUES (?, ?)").run(uploaded.name, uploaded.id)
		}
	}
}

module.exports.setupEmojis = setupEmojis
