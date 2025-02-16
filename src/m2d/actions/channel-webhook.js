// @ts-check

const assert = require("assert").strict
const DiscordTypes = require("discord-api-types/v10")
const stream = require("stream")
const passthrough = require("../../passthrough")
const {discord, db, select} = passthrough

/**
 * Look in the database to find webhook credentials for a channel.
 * (Note that the credentials may be invalid and need to be re-created if the webhook was interfered with from outside.)
 * @param {string} channelID
 * @param {boolean} forceCreate create a new webhook no matter what the database says about the state
 * @returns id and token for a webhook for that channel
 */
async function ensureWebhook(channelID, forceCreate = false) {
	if (!forceCreate) {
		const row = select("webhook", ["webhook_id", "webhook_token"], {channel_id: channelID}).get()
		if (row) {
			return {
				id: row.webhook_id,
				token: row.webhook_token,
				created: false
			}
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
	return callback(webhook).catch(async e => {
		if (e.message === `{"message": "Unknown Webhook", "code": 10015}`) { // pathetic error handling from SnowTransfer
			// Our webhook is gone. Maybe somebody deleted it, or removed and re-added OOYE from the guild.
			const newWebhook = await ensureWebhook(channelID, true)
			return callback(newWebhook) // not caught; if the error happens again just throw it instead of looping
		}

		throw e
	})
}

/**
 * @param {string} channelID
 * @param {DiscordTypes.RESTPostAPIWebhookWithTokenJSONBody & {files?: {name: string, file: Buffer | stream.Readable}[]}} data
 * @param {string} [threadID]
 */
async function sendMessageWithWebhook(channelID, data, threadID) {
	const result = await withWebhook(channelID, async webhook => {
		return discord.snow.webhook.executeWebhook(webhook.id, webhook.token, data, {wait: true, thread_id: threadID})
	})
	return result
}

/**
 * @param {string} channelID
 * @param {string} messageID
 * @param {DiscordTypes.RESTPatchAPIWebhookWithTokenMessageJSONBody & {files?: {name: string, file: Buffer | stream.Readable}[]}} data
 * @param {string} [threadID]
 */
async function editMessageWithWebhook(channelID, messageID, data, threadID) {
	const result = await withWebhook(channelID, async webhook => {
		return discord.snow.webhook.editWebhookMessage(webhook.id, webhook.token, messageID, {...data, thread_id: threadID})
	})
	return result
}

/**
 * @param {string} channelID
 * @param {string} messageID
 * @param {string} [threadID]
 */
async function deleteMessageWithWebhook(channelID, messageID, threadID) {
	const result = await withWebhook(channelID, async webhook => {
		return discord.snow.webhook.deleteWebhookMessage(webhook.id, webhook.token, messageID, threadID)
	})
	return result
}

module.exports.ensureWebhook = ensureWebhook
module.exports.withWebhook = withWebhook
module.exports.sendMessageWithWebhook = sendMessageWithWebhook
module.exports.editMessageWithWebhook = editMessageWithWebhook
module.exports.deleteMessageWithWebhook = deleteMessageWithWebhook
