// @ts-check

const {sync} = require("../passthrough")

/** @type {import("./actions/send-message")}) */
const sendMessage = sync.require("./actions/send-message")
/** @type {import("./actions/add-reaction")}) */
const addReaction = sync.require("./actions/add-reaction")

// Grab Discord events we care about for the bridge, check them, and pass them on

module.exports = {
	/**
	 * @param {import("./discord-client")} client
	 * @param {import("discord-api-types/v10").GatewayMessageCreateDispatchData} message
	 */
	onMessageCreate(client, message) {
		if (message.guild_id !== "112760669178241024") return // TODO: activate on other servers (requires the space creation flow to be done first)
		sendMessage.sendMessage(message)
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {import("discord-api-types/v10").GatewayMessageReactionAddDispatchData} data
	 */
	onReactionAdd(client, data) {
		if (data.emoji.id !== null) return // TODO: image emoji reactions
		console.log(data)
		addReaction.addReaction(data)
	}
}
