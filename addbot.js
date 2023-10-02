// @ts-check

const config = require("./config")

function addbot() {
	const token = config.discordToken
	const id = Buffer.from(token.split(".")[0], "base64")
	return `Open this link to add the bot to a Discord server:\nhttps://discord.com/oauth2/authorize?client_id=${id}&scope=bot&permissions=1610883072 `
}

if (process.argv.find(a => a.endsWith("addbot") || a.endsWith("addbot.js"))) {
	console.log(addbot())
}

module.exports.addbot = addbot
