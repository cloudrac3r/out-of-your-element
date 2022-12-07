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
		/** @type {import("discord-typings").User} */
		// @ts-ignore avoid setting as or null because we know we need to wait for ready anyways
		this.user = null
		/** @type {import("discord-typings").Application} */
		// @ts-ignore
		this.application = null
		/** @type {Map<string, import("discord-typings").Channel>} */
		this.channels = new Map()
		/** @type {Map<string, import("discord-typings").Guild>} */
		this.guilds = new Map()
		/**
		 * @type {Map<string, Array<string>>}
		 * @private
		 */
		this.guildChannelMap = new Map()
		this.cloud.on("event", this.onPacket.bind(this))
	}

	/**
	 * @param {import("cloudstorm").IGatewayMessage} message
	 * @private
	 */
	onPacket(message) {
		if (message.t === "READY") {
			if (wasReadyBefore) return
			wasReadyBefore = true
			/** @type {import("discord-typings").ReadyPayload} */
			const typed = message.d
			this.user = typed.user
			this.application = typed.application
			console.log(`Discord logged in as ${this.user.username}#${this.user.discriminator} (${this.user.id})`)


		} else if (message.t === "GUILD_CREATE") {
			/** @type {import("discord-typings").Guild} */
			const typed = message.d
			this.guilds.set(typed.id, typed)
			const arr = []
			this.guildChannelMap.set(typed.id, arr)
			for (const channel of typed.channels || []) {
				arr.push(channel.id)
				this.channels.set(channel.id, channel)
			}


		} else if (message.t === "GUILD_DELETE") {
			/** @type {import("discord-typings").Guild} */
			const typed = message.d
			this.guilds.delete(typed.id)
			const channels = this.guildChannelMap.get(typed.id)
			if (channels) {
				for (const id of channels) this.channels.delete(id)
			}
			this.guildChannelMap.delete(typed.id)


		} else if (message.t === "CHANNEL_CREATE" || message.t === "CHANNEL_DELETE") {
			/** @type {import("discord-typings").Channel} */
			const typed = message.d
			if (message.t === "CHANNEL_CREATE") {
				this.channels.set(typed.id, typed)
				if (typed["guild_id"]) { // obj[prop] notation can be used to access a property without typescript complaining that it doesn't exist on all values something can have
					const channels = this.guildChannelMap.get(typed["guild_id"])
					if (channels && !channels.includes(typed.id)) channels.push(typed.id)
				}
			} else {
				this.channels.delete(typed.id)
				if (typed["guild_id"]) {
					const channels = this.guildChannelMap.get(typed["guild_id"])
					if (channels) {
						const previous = channels.indexOf(typed.id)
						if (previous !== -1) channels.splice(previous, 1)
					}
				}
			}
		}
	}
}

module.exports = DiscordClient
