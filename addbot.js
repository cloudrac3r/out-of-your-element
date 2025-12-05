#!/usr/bin/env node
// @ts-check

const DiscordTypes = require("discord-api-types/v10")

const {reg} = require("./src/matrix/read-registration")
const token = reg.ooye.discord_token
const id = Buffer.from(token.split(".")[0], "base64").toString()
const permissions =
( DiscordTypes.PermissionFlagsBits.ManageWebhooks
| DiscordTypes.PermissionFlagsBits.ManageGuildExpressions
| DiscordTypes.PermissionFlagsBits.ManageMessages
| DiscordTypes.PermissionFlagsBits.PinMessages
| DiscordTypes.PermissionFlagsBits.UseExternalEmojis)

function addbot() {
	return `Open this link to add the bot to a Discord server:\nhttps://discord.com/oauth2/authorize?client_id=${id}&scope=bot&permissions=${permissions} `
}

/* c8 ignore next 3 */
if (process.argv.find(a => a.endsWith("addbot") || a.endsWith("addbot.js"))) {
	console.log(addbot())
}

module.exports.id = id
module.exports.addbot = addbot
module.exports.permissions = permissions
