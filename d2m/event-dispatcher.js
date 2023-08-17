const assert = require("assert").strict
const {sync, db} = require("../passthrough")

/** @type {import("./actions/send-message")}) */
const sendMessage = sync.require("./actions/send-message")
/** @type {import("./actions/edit-message")}) */
const editMessage = sync.require("./actions/edit-message")

/** @type {import("./actions/add-reaction")}) */
const addReaction = sync.require("./actions/add-reaction")

// Grab Discord events we care about for the bridge, check them, and pass them on

module.exports = {
	/**
	 * @param {import("./discord-client")} client
	 * @param {import("discord-api-types/v10").GatewayMessageCreateDispatchData} message
	 */
	onMessageCreate(client, message) {
		if (message.webhook_id) {
			const row = db.prepare("SELECT webhook_id FROM webhook WHERE webhook_id = ?").pluck().get(message.webhook_id)
			if (row) {
				// The message was sent by the bridge's own webhook on discord. We don't want to reflect this back, so just drop it.
				return
			}
		}
		/** @type {import("discord-api-types/v10").APIGuildChannel} */
		const channel = client.channels.get(message.channel_id)
		if (!channel.guild_id) return // Nothing we can do in direct messages.
		const guild = client.guilds.get(channel.guild_id)
		if (message.guild_id !== "112760669178241024" && message.guild_id !== "497159726455455754") return // TODO: activate on other servers (requires the space creation flow to be done first)
		sendMessage.sendMessage(message, guild)
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {import("discord-api-types/v10").GatewayMessageUpdateDispatchData} message
	 */
	onMessageUpdate(client, data) {
		if (data.webhook_id) {
			const row = db.prepare("SELECT webhook_id FROM webhook WHERE webhook_id = ?").pluck().get(message.webhook_id)
			if (row) {
				// The update was sent by the bridge's own webhook on discord. We don't want to reflect this back, so just drop it.
				return
			}
		}
		// Based on looking at data they've sent me over the gateway, this is the best way to check for meaningful changes.
		// If the message content is a string then it includes all interesting fields and is meaningful.
		if (typeof data.content === "string") {
			/** @type {import("discord-api-types/v10").GatewayMessageCreateDispatchData} */
			const message = data
			/** @type {import("discord-api-types/v10").APIGuildChannel} */
			const channel = client.channels.get(message.channel_id)
			if (!channel.guild_id) return // Nothing we can do in direct messages.
			const guild = client.guilds.get(channel.guild_id)
			if (message.guild_id !== "112760669178241024" && message.guild_id !== "497159726455455754") return // TODO: activate on other servers (requires the space creation flow to be done first)
			editMessage.editMessage(message, guild)
		}
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {import("discord-api-types/v10").GatewayMessageReactionAddDispatchData} data
	 */
	onReactionAdd(client, data) {
		if (data.user_id === client.user.id) return // m2d reactions are added by the discord bot user - do not reflect them back to matrix.
		if (data.emoji.id !== null) return // TODO: image emoji reactions
		console.log(data)
		addReaction.addReaction(data)
	}
}
