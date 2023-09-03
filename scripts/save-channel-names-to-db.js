// @ts-check

const sqlite = require("better-sqlite3")
const HeatSync = require("heatsync")

const config = require("../config")
const passthrough = require("../passthrough")
const db = new sqlite("db/ooye.db")

const sync = new HeatSync({watchFS: false})

Object.assign(passthrough, {config, sync, db})

const DiscordClient = require("../d2m/discord-client")

const discord = new DiscordClient(config.discordToken, "no")
passthrough.discord = discord

;(async () => {
	await discord.cloud.connect()
	console.log("Discord gateway started")

	const f = event => onPacket(discord, event, () => discord.cloud.off("event", f))
	discord.cloud.on("event", f)
})()

const expectedGuilds = new Set()

const prepared = db.prepare("UPDATE channel_room SET name = ? WHERE channel_id = ?")

/** @param {DiscordClient} discord */
function onPacket(discord, event, unsubscribe) {
	if (event.t === "READY") {
		for (const obj of event.d.guilds) {
			expectedGuilds.add(obj.id)
		}

	} else if (event.t === "GUILD_CREATE") {
		expectedGuilds.delete(event.d.id)

		// Store the channel.
		for (const channel of event.d.channels || []) {
			prepared.run(channel.name, channel.id)
		}

		// Checked them all?
		if (expectedGuilds.size === 0) {
			discord.cloud.disconnect()
			unsubscribe()

			// I don't know why node keeps running.
			setTimeout(() => {
				console.log("Stopping now.")
				process.exit()
			}, 1500).unref()
		}
	}
}
