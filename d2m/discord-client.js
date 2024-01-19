// @ts-check

const { SnowTransfer } = require("snowtransfer")
const { Client: CloudStorm } = require("cloudstorm")

const passthrough = require("../passthrough")
const { sync } = passthrough

/** @type {typeof import("./discord-packets")} */
const discordPackets = sync.require("./discord-packets")

class DiscordClient {
	/**
	 * @param {string} discordToken
	 * @param {string} listen "full", "half", "no" - whether to set up the event listeners for OOYE to operate
	 */
	constructor(discordToken, listen = "full") {
		this.discordToken = discordToken
		this.snow = new SnowTransfer(discordToken)
		this.cloud = new CloudStorm(discordToken, {
			shards: [0],
			reconnect: true,
			snowtransferInstance: this.snow,
			intents: [
				"DIRECT_MESSAGES", "DIRECT_MESSAGE_REACTIONS", "DIRECT_MESSAGE_TYPING",
				"GUILDS", "GUILD_EMOJIS_AND_STICKERS", "GUILD_MESSAGES", "GUILD_MESSAGE_REACTIONS", "GUILD_MESSAGE_TYPING", "GUILD_WEBHOOKS",
				"MESSAGE_CONTENT"
			],
			ws: {
				compress: false,
				encoding: "json"
			}
		})
		this.ready = false
		/** @type {import("discord-api-types/v10").APIUser} */
		// @ts-ignore avoid setting as or null because we know we need to wait for ready anyways
		this.user = null
		/** @type {Pick<import("discord-api-types/v10").APIApplication, "id" | "flags">} */
		// @ts-ignore
		this.application = null
		/** @type {Map<string, import("discord-api-types/v10").APIChannel>} */
		this.channels = new Map()
		/** @type {Map<string, import("discord-api-types/v10").APIGuild>} */
		this.guilds = new Map()
		/** @type {Map<string, Array<string>>} */
		this.guildChannelMap = new Map()
		if (listen !== "no") {
			this.cloud.on("event", message => discordPackets.onPacket(this, message, listen))
		}

		const addEventLogger = (eventName, logName) => {
			this.cloud.on(eventName, (...args) => {
				const d = new Date().toISOString().slice(0, 19)
				console.error(`[${d} Client ${logName}]`, ...args)
			})
		}
		addEventLogger("error", "Error")
		addEventLogger("disconnected", "Disconnected")
		addEventLogger("ready", "Ready")
	}
}

module.exports = DiscordClient
