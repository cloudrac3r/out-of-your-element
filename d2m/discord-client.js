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
	 */
	constructor(discordToken) {
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
		this.cloud.on("event", message => discordPackets.onPacket(this, message))
		this.cloud.on("error", console.error)
	}
}

module.exports = DiscordClient
