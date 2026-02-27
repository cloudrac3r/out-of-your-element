// @ts-check

const pb = require("prettier-bytes")
const sqlite = require("better-sqlite3")
const HeatSync = require("heatsync")

const {reg} = require("../src/matrix/read-registration")
const passthrough = require("../src/passthrough")

const sync = new HeatSync({watchFS: false})
Object.assign(passthrough, {reg, sync})

const DiscordClient = require("../src/d2m/discord-client")

const discord = new DiscordClient(reg.ooye.discord_token, "no")
passthrough.discord = discord

const db = new sqlite("ooye.db")
passthrough.db = db

const api = require("../src/matrix/api")

const {room: roomID} = require("minimist")(process.argv.slice(2), {string: ["room"]})
if (!roomID) {
	console.error("Usage: ./scripts/estimate-size.js --room=<!room id here>")
	process.exit(1)
}

const {channel_id, guild_id} = db.prepare("SELECT channel_id, guild_id FROM channel_room WHERE room_id = ?").get(roomID)

const max = 1000

;(async () => {
	let total = 0
	let size = 0
	let from

	while (total < max) {
		const events = await api.getEvents(roomID, "b", {limit: 1000, from})
		total += events.chunk.length
		from = events.end
		console.log(`Fetched ${total} events so far`)

		for (const e of events.chunk) {
			if (e.content?.info?.size) {
				size += e.content.info.size
			}
		}

		if (events.chunk.length === 0 || !events.end) break
	}

	console.log(`Total size of uploads: ${pb(size)}`)

	const searchResults = await discord.snow.requestHandler.request(`/guilds/${guild_id}/messages/search`, {
		channel_id,
		offset: "0",
		limit: "1"
	}, "get", "json")

	const totalAllTime = searchResults.total_results
	const fractionCounted = total / totalAllTime
	console.log(`That counts for ${(fractionCounted*100).toFixed(2)}% of the history on Discord (${totalAllTime.toLocaleString()} messages)`)
	console.log(`The size of uploads for the whole history would be approx: ${pb(Math.floor(size/total*totalAllTime))}`)
})()
