const { SnowTransfer } = require("snowtransfer")
const { Client: CloudStorm } = require("cloudstorm")

let wasReadyBefore = false

class DiscordClient {
	/**
	 * @param {string} discordToken
	 */
	constructor(discordToken) {
		this.discordToken = discordToken
		this.snow = new SnowTransfer(discordToken)
		this.cloud = new CloudStorm(discordToken, {
			shards: "auto",
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
		/** @type {import("discord-typings").User | null} */
		this.user = null
		/** @type {import("discord-typings").Application | null} */
		this.application = null
		/** @type {Map<string, import("discord-typings").Channel>} */
		this.channels = new Map()
		this.cloud.on("event", this.onPacket.bind(this))
	}

	/**
	 * @param {import("cloudstorm").IGatewayMessage} message
	 * @private
	 */
	onPacket(message) {
		if (message.t === "READY") {
			if (wasReadyBefore) return
			/** @type {import("discord-typings").ReadyPayload} */
			const typed = message.d
			this.user = typed.user
			this.application = typed.application
			console.log(`Discord logged in as ${this.user.username}#${this.user.discriminator} (${this.user.id})`)
		} else if (message.t === "GUILD_CREATE") {
			/** @type {import("discord-typings").Guild} */
			const typed = message.d
			for (const channel of typed.channels || []) {
				this.channels.set(channel.id, channel)
			}
		} else if (message.t === "CHANNEL_CREATE" || message.t === "CHANNEL_DELETE") {
			/** @type {import("discord-typings").Channel} */
			const typed = message.d
			if (message.t === "CHANNEL_CREATE") this.channels.set(typed.id, typed)
			else this.channels.delete(typed.id)
		}
	}
}

module.exports = DiscordClient
