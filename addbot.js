#!/usr/bin/env node
// @ts-check

const {reg} = require("./src/matrix/read-registration")
const token = reg.ooye.discord_token
const id = Buffer.from(token.split(".")[0], "base64").toString()

function addbot() {
	return `Open this link to add the bot to a Discord server:\nhttps://discord.com/oauth2/authorize?client_id=${id}&scope=bot&permissions=1610883072 `
}

/* c8 ignore next 3 */
if (process.argv.find(a => a.endsWith("addbot") || a.endsWith("addbot.js"))) {
	console.log(addbot())
}

module.exports.id = id
module.exports.addbot = addbot
