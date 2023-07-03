// @ts-check

const assert = require("assert").strict
const DiscordTypes = require("discord-api-types/v10")
const passthrough = require("../../passthrough")
const {discord, db} = passthrough

/**
 * Look in the database to find webhook credentials for a channel.
 * (Note that the credentials may be invalid and need to be re-created if the webhook was interfered with from outside.)
 * @param {string} channelID
 * @param {boolean} forceCreate create a new webhook no matter what the database says about the state
 * @returns id and token for a webhook for that channel
 */
async function ensureWebhook(channelID, forceCreate = false) {
	if (!forceCreate) {
		/** @type {{id: string, token: string} | null} */
		const row = db.prepare("SELECT webhook_id as id, webhook_token as token FROM webhook WHERE channel_id = ?").get(channelID)
		if (row) {
			return {created: false, ...row}
		}
	}

	// If we got here, we need to create a new webhook.
	const webhook = await discord.snow.webhook.createWebhook(channelID, {name: "Out Of Your Element: Matrix Bridge"})
	assert(webhook.token)
	db.prepare("REPLACE INTO webhook (channel_id, webhook_id, webhook_token) VALUES (?, ?, ?)").run(channelID, webhook.id, webhook.token)
	return {
		id: webhook.id,
		token: webhook.token,
		created: true
	}
}

/**
 * @param {string} channelID
 * @param {(webhook: import("../../types").WebhookCreds) => Promise<T>} callback
 * @returns Promise<T>
 * @template T
 */
async function withWebhook(channelID, callback) {
	const webhook = await ensureWebhook(channelID, false)
	return callback(webhook).catch(e => {
		console.error(e)
		// TODO: check if the error was webhook-related and if webhook.created === false, then: const webhook = ensureWebhook(channelID, true); return callback(webhook)
		throw new Error(e)
	})
}

/**
 * @param {string} channelID
 * @param {DiscordTypes.RESTPostAPIWebhookWithTokenJSONBody & {files?: {name: string, file: Buffer}[]}[]} data
 */
async function sendMessageWithWebhook(channelID, data) {
   const result = await withWebhook(channelID, async webhook => {
      return discord.snow.webhook.executeWebhook(webhook.id, webhook.token, data, {wait: true, disableEveryone: true})
   })
   return result
}

module.exports.ensureWebhook = ensureWebhook
module.exports.withWebhook = withWebhook
module.exports.sendMessageWithWebhook = sendMessageWithWebhook
