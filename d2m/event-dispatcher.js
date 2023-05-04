// @ts-check

const {sync} = require("../passthrough")

/** @type {import("./actions/create-space")}) */
const createSpace = sync.require("./actions/create-space")

/** @type {import("./actions/send-message")}) */
const sendMessage = sync.require("./actions/send-message")

// Grab Discord events we care about for the bridge, check them, and pass them on

module.exports = {
	/**
	 * @param {import("./discord-client")} client
	 * @param {import("discord-api-types/v10").GatewayMessageCreateDispatchData} message
	 */
	onMessageCreate(client, message) {
		sendMessage.sendMessage(message)
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
