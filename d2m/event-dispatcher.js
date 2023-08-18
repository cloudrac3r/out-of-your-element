const assert = require("assert").strict
const util = require("util")
const {sync, db} = require("../passthrough")

/** @type {import("./actions/send-message")}) */
const sendMessage = sync.require("./actions/send-message")
/** @type {import("./actions/edit-message")}) */
const editMessage = sync.require("./actions/edit-message")
/** @type {import("./actions/delete-message")}) */
const deleteMessage = sync.require("./actions/delete-message")
/** @type {import("./actions/add-reaction")}) */
const addReaction = sync.require("./actions/add-reaction")
/** @type {import("../matrix/api")}) */
const api = sync.require("../matrix/api")

let lastReportedEvent = 0

// Grab Discord events we care about for the bridge, check them, and pass them on

module.exports = {
	/**
	 * @param {import("./discord-client")} client
	 * @param {Error} e
	 * @param {import("cloudstorm").IGatewayMessage} gatewayMessage
	 */
	onError(client, e, gatewayMessage) {
		console.error("hit event-dispatcher's error handler with this exception:")
		console.error(e) // TODO: also log errors into a file or into the database, maybe use a library for this? or just wing it? definitely need to be able to store the formatted event body to load back in later
		console.error(`while handling this ${gatewayMessage.t} gateway event:`)
		console.dir(gatewayMessage.d, {depth: null})

		if (Date.now() - lastReportedEvent > 5000) {
			lastReportedEvent = Date.now()
			const channelID = gatewayMessage.d.channel_id
			if (channelID) {
				const roomID = db.prepare("SELECT room_id FROM channel_room WHERE channel_id = ?").pluck().get(channelID)
				let stackLines = e.stack.split("\n")
				let cloudstormLine = stackLines.findIndex(l => l.includes("/node_modules/cloudstorm/"))
				if (cloudstormLine !== -1) {
					stackLines = stackLines.slice(0, cloudstormLine - 2)
				}
				api.sendEvent(roomID, "m.room.message", {
					msgtype: "m.text",
					body: "\u26a0 Bridged event from Discord not delivered. See formatted content for full details.",
					format: "org.matrix.custom.html",
					formatted_body: "\u26a0 <strong>Bridged event from Discord not delivered</strong>"
						+ `<br>Gateway event: ${gatewayMessage.t}`
						+ `<pre>${stackLines.join("\n")}</pre>`
						+ `<details><summary>Original payload</summary>`
						+ `<pre>${util.inspect(gatewayMessage.d, false, 4, false)}</pre></details>`,
					"m.mentions": {
						user_ids: ["@cadence:cadence.moe"]
					}
				})
			}
		}
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {import("discord-api-types/v10").GatewayMessageCreateDispatchData} message
	 */
	async onMessageCreate(client, message) {
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
		await sendMessage.sendMessage(message, guild)
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {import("discord-api-types/v10").GatewayMessageUpdateDispatchData} message
	 */
	async onMessageUpdate(client, data) {
		if (data.webhook_id) {
			const row = db.prepare("SELECT webhook_id FROM webhook WHERE webhook_id = ?").pluck().get(data.webhook_id)
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
			await editMessage.editMessage(message, guild)
		}
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {import("discord-api-types/v10").GatewayMessageReactionAddDispatchData} data
	 */
	async onReactionAdd(client, data) {
		if (data.user_id === client.user.id) return // m2d reactions are added by the discord bot user - do not reflect them back to matrix.
		if (data.emoji.id !== null) return // TODO: image emoji reactions
		console.log(data)
		await addReaction.addReaction(data)
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {import("discord-api-types/v10").GatewayMessageDeleteDispatchData} data
	 */
	async onMessageDelete(client, data) {
		console.log(data)
		await deleteMessage.deleteMessage(data)
	}
}
