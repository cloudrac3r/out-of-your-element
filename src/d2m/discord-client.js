// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const {Endpoints, SnowTransfer} = require("snowtransfer")
const {reg} = require("../matrix/read-registration")
const {Client: CloudStorm} = require("cloudstorm")

// @ts-ignore
Endpoints.BASE_HOST = reg.ooye.discord_origin || "https://discord.com"; Endpoints.CDN_URL = reg.ooye.discord_cdn_origin || "https://cdn.discordapp.com"

const passthrough = require("../passthrough")
const {sync} = passthrough

/** @type {import("./discord-packets")} */
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
				"MESSAGE_CONTENT", "GUILD_PRESENCES"
			],
			ws: {
				compress: false,
				encoding: "json"
			}
		})
		this.ready = false
		/** @type {DiscordTypes.APIUser} */
		// @ts-ignore avoid setting as or null because we know we need to wait for ready anyways
		this.user = null
		/** @type {Pick<DiscordTypes.APIApplication, "id" | "flags">} */
		// @ts-ignore
		this.application = null
		/** @type {Map<string, DiscordTypes.APIChannel>} */
		this.channels = new Map()
		/** @type {Map<string, DiscordTypes.APIGuild & {members: DiscordTypes.APIGuildMember[]}>} */ // we get members from the GUILD_CREATE and we do maintain it
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
