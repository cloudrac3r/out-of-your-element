// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const {reg} = require("../matrix/read-registration")

const passthrough = require("../passthrough")
const {sync} = passthrough

/** @type {import("./elizabot")} */
const eliza = sync.require("./elizabot")

/**
 * @param {string} priorContent
 * @returns {string | undefined}
 */
function generateContent(priorContent) {
	const bot = new eliza.ElizaBot(true)
	return bot.transform(priorContent)
}

/**
 * @param {DiscordTypes.GatewayMessageCreateDispatchData} message
 * @param {string} guildID
 * @param {string} username
 * @param {string} avatar_url
 * @param {boolean} useCaps
 * @param {boolean} usePunct
 * @param {boolean} useApos
 * @returns {DiscordTypes.RESTPostAPIWebhookWithTokenJSONBody | undefined}
 */
function generate(message, guildID, username, avatar_url, useCaps, usePunct, useApos) {
	let content = generateContent(message.content)
	if (!content) return

	if (!useCaps) {
		content = content.toLowerCase()
	}

	if (!usePunct) {
		content = content.replace(/[.!]$/, "")
	}

	if (!useApos) {
		content = content.replace(/['‘’]/g, "")
	}

	return {
		username: username,
		avatar_url: avatar_url,
		content: content + `\n-# Powered by Grimace.AI | [Learn More](<${reg.ooye.bridge_origin}/agi?guild_id=${guildID}>)`
	}
}

module.exports._generateContent = generateContent
module.exports.generate = generate
