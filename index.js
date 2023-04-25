// @ts-check

const HeatSync = require("heatsync")

const config = require("./config")
const passthrough = require("./passthrough")

const sync = new HeatSync()

Object.assign(passthrough, { config, sync })

const DiscordClient = require("./d2m/discord-client")

const discord = new DiscordClient(config.discordToken)
passthrough.discord = discord

;(async () => {
	await discord.cloud.connect()
	console.log("Discord gateway started")

	require("./stdin")
})()

// process.on("unhandledRejection", console.error)
// process.on("uncaughtException", console.error)
