// @ts-check

const assert = require("assert").strict
const DiscordTypes = require("discord-api-types/v10")
const passthrough = require("../../passthrough")
const {sync, discord, db} = passthrough

/** @type {import("./register-webhook")} */
const registerWebhook = sync.require("./register-webhook")

/**
 * @param {string} channelID
 * @param {DiscordTypes.RESTPostAPIWebhookWithTokenJSONBody & {name: string, file: Buffer}[]} data
 */
// param {DiscordTypes.RESTPostAPIWebhookWithTokenQuery & {wait: true, disableEveryone?: boolean}} options
async function sendMessage(channelID, data) {
   const result = await registerWebhook.withWebhook(channelID, async webhook => {
      return discord.snow.webhook.executeWebhook(webhook.id, webhook.token, data, {wait: true, disableEveryone: true})
   })
   return result
}

module.exports.sendMessage = sendMessage
