const assert = require("assert").strict
const util = require("util")
const {sync, db, select, from} = require("../passthrough")

/** @type {import("./actions/send-message")}) */
const sendMessage = sync.require("./actions/send-message")
/** @type {import("./actions/edit-message")}) */
const editMessage = sync.require("./actions/edit-message")
/** @type {import("./actions/delete-message")}) */
const deleteMessage = sync.require("./actions/delete-message")
/** @type {import("./actions/add-reaction")}) */
const addReaction = sync.require("./actions/add-reaction")
/** @type {import("./actions/remove-reaction")}) */
const removeReaction = sync.require("./actions/remove-reaction")
/** @type {import("./actions/announce-thread")}) */
const announceThread = sync.require("./actions/announce-thread")
/** @type {import("./actions/create-room")}) */
const createRoom = sync.require("./actions/create-room")
/** @type {import("./actions/create-space")}) */
const createSpace = sync.require("./actions/create-space")
/** @type {import("../matrix/api")}) */
const api = sync.require("../matrix/api")
/** @type {import("../discord/discord-command-handler")}) */
const discordCommandHandler = sync.require("../discord/discord-command-handler")

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

		if (gatewayMessage.t === "TYPING_START") return

		if (Date.now() - lastReportedEvent < 5000) return
		lastReportedEvent = Date.now()

		const channelID = gatewayMessage.d.channel_id
		if (!channelID) return
		const roomID = select("channel_room", "room_id", "WHERE channel_id = ?").pluck().get(channelID)
		if (!roomID) return

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
				+ `<br>${e.toString()}`
				+ `<br><details><summary>Error trace</summary>`
				+ `<pre>${stackLines.join("\n")}</pre></details>`
				+ `<details><summary>Original payload</summary>`
				+ `<pre>${util.inspect(gatewayMessage.d, false, 4, false)}</pre></details>`,
			"moe.cadence.ooye.error": {
				source: "discord",
				payload: gatewayMessage
			},
			"m.mentions": {
				user_ids: ["@cadence:cadence.moe"]
			}
		})
	},

	/**
	 * When logging back in, check if we missed any conversations in any channels. Bridge up to 49 missed messages per channel.
	 * If more messages were missed, only the latest missed message will be posted. TODO: Consider bridging more, or post a warning when skipping history?
	 * This can ONLY detect new messages, not any other kind of event. Any missed edits, deletes, reactions, etc will not be bridged.
	 * @param {import("./discord-client")} client
	 * @param {import("discord-api-types/v10").GatewayGuildCreateDispatchData} guild
	 */
	async checkMissedMessages(client, guild) {
		if (guild.unavailable) return
		const bridgedChannels = select("channel_room", "channel_id").pluck().all()
		const prepared = select("event_message", "event_id", "WHERE message_id = ?").pluck()
		for (const channel of guild.channels.concat(guild.threads)) {
			if (!bridgedChannels.includes(channel.id)) continue
			if (!channel.last_message_id) continue
			const latestWasBridged = prepared.get(channel.last_message_id)
			if (latestWasBridged) continue

			/** More recent messages come first. */
			// console.log(`[check missed messages] in ${channel.id} (${guild.name} / ${channel.name}) because its last message ${channel.last_message_id} is not in the database`)
			let messages
			try {
				messages = await client.snow.channel.getChannelMessages(channel.id, {limit: 50})
			} catch (e) {
				if (e.message === `{"message": "Missing Access", "code": 50001}`) { // pathetic error handling from SnowTransfer
					console.log(`[check missed messages] no permissions to look back in channel ${channel.name} (${channel.id})`)
					continue // Sucks.
				} else {
					throw e // Sucks more.
				}
			}
			let latestBridgedMessageIndex = messages.findIndex(m => {
				return prepared.get(m.id)
			})
			// console.log(`[check missed messages] got ${messages.length} messages; last message that IS bridged is at position ${latestBridgedMessageIndex} in the channel`)
			if (latestBridgedMessageIndex === -1) latestBridgedMessageIndex = 1 // rather than crawling the ENTIRE channel history, let's just bridge the most recent 1 message to make it up to date.
			for (let i = Math.min(messages.length, latestBridgedMessageIndex)-1; i >= 0; i--) {
				const simulatedGatewayDispatchData = {
					guild_id: guild.id,
					mentions: [],
					backfill: true,
					...messages[i]
				}
				await module.exports.onMessageCreate(client, simulatedGatewayDispatchData)
			}
		}
	},

	/**
	 * Announces to the parent room that the thread room has been created.
	 * See notes.md, "Ignore MESSAGE_UPDATE and bridge THREAD_CREATE as the announcement"
	 * @param {import("./discord-client")} client
	 * @param {import("discord-api-types/v10").APIThreadChannel} thread
	 */
	async onThreadCreate(client, thread) {
		const parentRoomID = select("channel_room", "room_id", "WHERE channel_room = ?").pluck().get(thread.parent_id)
		if (!parentRoomID) return // Not interested in a thread if we aren't interested in its wider channel
		const threadRoomID = await createRoom.syncRoom(thread.id) // Create room (will share the same inflight as the initial message to the thread)
		await announceThread.announceThread(parentRoomID, threadRoomID, thread)
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {import("discord-api-types/v10").GatewayGuildUpdateDispatchData} guild
	 */
	async onGuildUpdate(client, guild) {
		const spaceID = select("guild_space", "space_id", "WHERE guild_id = ?").pluck().get(guild.id)
		if (!spaceID) return
		await createSpace.syncSpace(guild)
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {import("discord-api-types/v10").GatewayChannelUpdateDispatchData} channelOrThread
	 * @param {boolean} isThread
	 */
	async onChannelOrThreadUpdate(client, channelOrThread, isThread) {
		const roomID = select("channel_room", "room_id", "WHERE channel_id = ?").pluck().get(channelOrThread.id)
		if (!roomID) return // No target room to update the data on
		await createRoom.syncRoom(channelOrThread.id)
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {import("discord-api-types/v10").GatewayMessageCreateDispatchData} message
	 */
	async onMessageCreate(client, message) {
		if (message.webhook_id) {
			const row = select("webhook", "webhook_id", "WHERE webhook_id = ?").pluck().get(message.webhook_id)
			if (row) {
				// The message was sent by the bridge's own webhook on discord. We don't want to reflect this back, so just drop it.
				return
			}
		}
		/** @type {import("discord-api-types/v10").APIGuildChannel} */
		const channel = client.channels.get(message.channel_id)
		if (!channel.guild_id) return // Nothing we can do in direct messages.
		const guild = client.guilds.get(channel.guild_id)

		await sendMessage.sendMessage(message, guild),
		await discordCommandHandler.execute(message, channel, guild)
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {import("discord-api-types/v10").GatewayMessageUpdateDispatchData} data
	 */
	async onMessageUpdate(client, data) {
		if (data.webhook_id) {
			const row = select("webhook", "webhook_id", "WHERE webhook_id = ?").pluck().get(data.webhook_id)
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
			await editMessage.editMessage(message, guild)
		}
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {import("discord-api-types/v10").GatewayMessageReactionAddDispatchData} data
	 */
	async onReactionAdd(client, data) {
		if (data.user_id === client.user.id) return // m2d reactions are added by the discord bot user - do not reflect them back to matrix.
		discordCommandHandler.onReactionAdd(data)
		await addReaction.addReaction(data)
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {import("discord-api-types/v10").GatewayMessageReactionRemoveDispatchData} data
	 */
	async onReactionRemove(client, data) {
		await removeReaction.removeReaction(data)
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {import("discord-api-types/v10").GatewayMessageReactionRemoveEmojiDispatchData} data
	 */
	async onReactionEmojiRemove(client, data) {
		await removeReaction.removeEmojiReaction(data)
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {import("discord-api-types/v10").GatewayMessageReactionRemoveAllDispatchData} data
	 */
	async onRemoveAllReactions(client, data) {
		await removeReaction.removeAllReactions(data)
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {import("discord-api-types/v10").GatewayMessageDeleteDispatchData} data
	 */
	async onMessageDelete(client, data) {
		await deleteMessage.deleteMessage(data)
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {import("discord-api-types/v10").GatewayTypingStartDispatchData} data
	 */
	async onTypingStart(client, data) {
		const roomID = select("channel_room", "room_id", "WHERE channel_id = ?").pluck().get(data.channel_id)
		if (!roomID) return
		const mxid = from("sim").join("sim_member", "mxid").and("WHERE discord_id = ? AND room_id = ?").pluck("mxid").get(data.user_id, roomID)
		if (!mxid) return
		// Each Discord user triggers the notification every 8 seconds as long as they remain typing.
		// Discord does not send typing stopped events, so typing only stops if the timeout is reached or if the user sends their message.
		// (We have to manually stop typing on Matrix-side when the message is sent. This is part of the send action.)
		await api.sendTyping(roomID, true, mxid, 10000)
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {import("discord-api-types/v10").GatewayGuildEmojisUpdateDispatchData | import("discord-api-types/v10").GatewayGuildStickersUpdateDispatchData} data
	 */
	async onExpressionsUpdate(client, data) {
		await createSpace.syncSpaceExpressions(data)
	}
}
