// @ts-check

// Grab Discord events we care about for the bridge, check them, and pass them on

const sendMessage = require("./actions/send-message")

module.exports = {
	/**
	 * @param {import("./discord-client")} client
	 * @param {import("discord-api-types/v10").GatewayMessageCreateDispatchData} message
	 */
	onMessageCreate(client, message) {
		console.log(message)
		console.log(message.guild_id)
		console.log(message.member)
		sendMessage(message)
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {import("discord-api-types/v10").GatewayMessageReactionAddDispatchData} data
	 */
	onReactionAdd(client, data) {
		console.log(data)
		return {}
	}
}
