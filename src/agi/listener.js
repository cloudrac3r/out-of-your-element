// @ts-check

const DiscordTypes = require("discord-api-types/v10")

const passthrough = require("../passthrough")
const {discord, sync, db, select, from} = passthrough

/** @type {import("../m2d/actions/channel-webhook")} */
const channelWebhook = sync.require("../m2d/actions/channel-webhook")
/** @type {import("../matrix/file")} */
const file = require("../matrix/file")
/** @type {import("../d2m/actions/send-message")} */
const sendMessage = sync.require("../d2m/actions/send-message")
/** @type {import("./generator.js")} */
const agiGenerator = sync.require("./generator.js")

const AGI_GUILD_COOLDOWN = 1 * 60 * 60 * 1000 // 1 hour
const AGI_MESSAGE_RECENCY = 3 * 60 * 1000 // 3 minutes

/**
 * @param {DiscordTypes.GatewayMessageCreateDispatchData} message
 * @param {DiscordTypes.APIGuildChannel} channel
 * @param {DiscordTypes.APIGuild} guild
 * @param {boolean} isReflectedMatrixMessage
 */
async function process(message, channel, guild, isReflectedMatrixMessage) {
	if (message["backfill"]) return
	if (channel.type !== DiscordTypes.ChannelType.GuildText) return
	if (!(new Date().toISOString().startsWith("2026-04-01"))) return

	const optout = select("agi_optout", "guild_id", {guild_id: guild.id}).pluck().get()
	if (optout) return

	const cooldown = select("agi_cooldown", "timestamp", {guild_id: guild.id}).pluck().get()
	if (cooldown && Date.now() < cooldown + AGI_GUILD_COOLDOWN) return

	const isBot = message.author.bot && !isReflectedMatrixMessage // Bots don't get jokes. Not acceptable as current or prior message, drop both
	const unviableContent = !message.content || message.attachments.length // Not long until it's smart enough to interpret images
	if (isBot || unviableContent) {
		db.prepare("DELETE FROM agi_prior_message WHERE channel_id = ?").run(channel.id)
		return
	}

	const currentUsername = message.member?.nick || message.author.global_name || message.author.username

	/** Message in the channel before the currently processing one. */
	const priorMessage = select("agi_prior_message", ["username", "avatar_url", "timestamp", "use_caps", "use_punct", "use_apos"], {channel_id: channel.id}).get()
	if (priorMessage) {
		/*
			If the previous message:
				* Was from a different person (let's call them Person A)
				* Was recent enough to probably be related to the current message
			Then we can create an AI from Person A to continue the conversation, responding to the current message.
		*/
		const isFromDifferentPerson = currentUsername !== priorMessage.username
		const isRecentEnough = Date.now() < priorMessage.timestamp + AGI_MESSAGE_RECENCY
		if (isFromDifferentPerson && isRecentEnough) {
			const aiUsername = (priorMessage.username.match(/[A-Za-z0-9_]+/)?.[0] || priorMessage.username) + " AI"
			const result = agiGenerator.generate(message, guild.id, aiUsername, priorMessage.avatar_url, !!priorMessage.use_caps, !!priorMessage.use_punct, !!priorMessage.use_apos)
			if (result) {
				db.prepare("REPLACE INTO agi_cooldown (guild_id, timestamp) VALUES (?, ?)").run(guild.id, Date.now())
				const messageResponse = await channelWebhook.sendMessageWithWebhook(channel.id, result)
				await sendMessage.sendMessage(messageResponse, channel, guild, null) // make it show up on matrix-side (the standard event dispatcher drops it)
			}
		}
	}

	// Now the current message is the prior message.
	const currentAvatarURL = file.DISCORD_IMAGES_BASE + file.memberAvatar(guild.id, message.author, message.member)
	const usedCaps = +!!message.content.match(/\b[A-Z](\b|[a-z])/)
	const usedPunct = +!!message.content.match(/[.!?]($| |\n)/)
	const usedApos = +!message.content.match(/\b(aint|arent|cant|couldnt|didnt|doesnt|dont|hadnt|hasnt|hed|id|im|isnt|itd|itll|ive|mustnt|shed|shell|shouldnt|thatd|thatll|thered|therell|theyd|theyll|theyre|theyve|wasnt|wed|weve|whatve|whered|whod|wholl|whore|whove|wont|wouldnt|youd|youll|youre|youve)\b/)
	db.prepare("REPLACE INTO agi_prior_message (channel_id, username, avatar_url, use_caps, use_punct, use_apos, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)").run(channel.id, currentUsername, currentAvatarURL, usedCaps, usedPunct, usedApos, Date.now())
}

module.exports.process = process
