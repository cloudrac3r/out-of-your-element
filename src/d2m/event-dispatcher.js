// @ts-check

const assert = require("assert").strict
const DiscordTypes = require("discord-api-types/v10")
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
/** @type {import("./actions/update-pins")}) */
const updatePins = sync.require("./actions/update-pins")
/** @type {import("../matrix/api")}) */
const api = sync.require("../matrix/api")
/** @type {import("../discord/utils")} */
const dUtils = sync.require("../discord/utils")
/** @type {import("./actions/speedbump")} */
const speedbump = sync.require("./actions/speedbump")
/** @type {import("./actions/retrigger")} */
const retrigger = sync.require("./actions/retrigger")
/** @type {import("./actions/set-presence")} */
const setPresence = sync.require("./actions/set-presence")
/** @type {import("../m2d/event-dispatcher")} */
const matrixEventDispatcher = sync.require("../m2d/event-dispatcher")

const {Semaphore} = require("@chriscdn/promise-semaphore")
const checkMissedPinsSema = new Semaphore()

// Grab Discord events we care about for the bridge, check them, and pass them on

module.exports = {
	/**
	 * @param {import("./discord-client")} client
	 * @param {Error} e
	 * @param {import("cloudstorm").IGatewayMessage} gatewayMessage
	 */
	async onError(client, e, gatewayMessage) {
		const channelID = gatewayMessage.d["channel_id"]
		if (!channelID) return
		const roomID = select("channel_room", "room_id", {channel_id: channelID}).pluck().get()
		if (!roomID) return

		if (gatewayMessage.t === "TYPING_START") return

		await matrixEventDispatcher.sendError(roomID, "Discord", gatewayMessage.t, e, gatewayMessage)
	},

	/**
	 * When logging back in, check if we missed any conversations in any channels. Bridge up to 49 missed messages per channel.
	 * If more messages were missed, only the latest missed message will be posted. TODO: Consider bridging more, or post a warning when skipping history?
	 * This can ONLY detect new messages, not any other kind of event. Any missed edits, deletes, reactions, etc will not be bridged.
	 * @param {import("./discord-client")} client
	 * @param {DiscordTypes.GatewayGuildCreateDispatchData} guild
	 */
	async checkMissedMessages(client, guild) {
		if (guild.unavailable) return
		const bridgedChannels = select("channel_room", "channel_id").pluck().all()
		const preparedExists = db.prepare("SELECT channel_id FROM message_channel WHERE channel_id = ? LIMIT 1")
		const preparedGet = select("event_message", "event_id", {}, "WHERE message_id = ?").pluck()
		/** @type {(DiscordTypes.APIChannel & {type: DiscordTypes.GuildChannelType})[]} */
		let channels = []
		channels = channels.concat(guild.channels, guild.threads)
		for (const channel of channels) {
			if (!bridgedChannels.includes(channel.id)) continue
			if (!("last_message_id" in channel) || !channel.last_message_id) continue

			// Skip if channel is already up-to-date
			const latestWasBridged = preparedGet.get(channel.last_message_id)
			if (latestWasBridged) continue

			// Skip if channel was just added to the bridge (there's no place to resume from if it's brand new)
			if (!preparedExists.get(channel.id)) continue

			// Permissions check
			const member = guild.members.find(m => m.user?.id === client.user.id)
			if (!member) return
			if (!("permission_overwrites" in channel)) continue
			const permissions = dUtils.getPermissions(member.roles, guild.roles, client.user.id, channel.permission_overwrites)
			if (!dUtils.hasAllPermissions(permissions, ["ViewChannel", "ReadMessageHistory"])) continue // We don't have permission to look back in this channel

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
				return preparedGet.get(m.id)
			})
			// console.log(`[check missed messages] got ${messages.length} messages; last message that IS bridged is at position ${latestBridgedMessageIndex} in the channel`)
			if (latestBridgedMessageIndex === -1) latestBridgedMessageIndex = 1 // rather than crawling the ENTIRE channel history, let's just bridge the most recent 1 message to make it up to date.

			// We get member data so that we can accurately update any changes to nickname or permissions that have occurred in the meantime
			// The rate limit is lax enough that the backlog will still be pretty quick (at time of writing, 5 per 1 second per guild)
			/** @type {Map<string, DiscordTypes.APIGuildMember | undefined>} id -> member: cache members for the run because people talk to each other */
			const members = new Map()

			// Send in order
			for (let i = Math.min(messages.length, latestBridgedMessageIndex)-1; i >= 0; i--) {
				const message = messages[i]

				if (!members.has(message.author.id)) members.set(message.author.id, await client.snow.guild.getGuildMember(guild.id, message.author.id).catch(() => undefined))
				await module.exports.MESSAGE_CREATE(client, {
					guild_id: guild.id,
					member: members.get(message.author.id),
					// @ts-ignore
					backfill: true,
					...message
				})
			}
		}
	},

	/**
	 * When logging back in, check if the pins on Matrix-side are up to date. If they aren't, update all pins.
	 * Rather than query every room on Matrix-side, we cache the latest pinned message in the database and compare against that.
	 * @param {import("./discord-client")} client
	 * @param {DiscordTypes.GatewayGuildCreateDispatchData} guild
	 */
	async checkMissedPins(client, guild) {
		if (guild.unavailable) return
		const member = guild.members.find(m => m.user?.id === client.user.id)
		if (!member) return
		for (const channel of guild.channels) {
			if (!("last_pin_timestamp" in channel) || !channel.last_pin_timestamp) continue // Only care about channels that have pins
			if (!("permission_overwrites" in channel)) continue
			const lastPin = updatePins.convertTimestamp(channel.last_pin_timestamp)

			// Permissions check
			const permissions = dUtils.getPermissions(member.roles, guild.roles, client.user.id, channel.permission_overwrites)
			if (!dUtils.hasAllPermissions(permissions, ["ViewChannel", "ReadMessageHistory"])) continue // We don't have permission to look up the pins in this channel

			const row = select("channel_room", ["room_id", "last_bridged_pin_timestamp"], {channel_id: channel.id}).get()
			if (!row) continue // Only care about already bridged channels
			if (row.last_bridged_pin_timestamp == null || lastPin > row.last_bridged_pin_timestamp) {
				checkMissedPinsSema.request(() => updatePins.updatePins(channel.id, row.room_id, lastPin))
			}
		}
	},

	/**
	 * When logging back in, check if we missed any changes to emojis or stickers. Apply the changes if so.
	 * @param {DiscordTypes.GatewayGuildCreateDispatchData} guild
	 */
	async checkMissedExpressions(guild) {
		const data = {guild_id: guild.id, ...guild}
		await createSpace.syncSpaceExpressions(data, true)
	},

	/**
	 * Announces to the parent room that the thread room has been created.
	 * See notes.md, "Ignore MESSAGE_UPDATE and bridge THREAD_CREATE as the announcement"
	 * @param {import("./discord-client")} client
	 * @param {DiscordTypes.APIThreadChannel} thread
	 */
	async THREAD_CREATE(client, thread) {
		const channelID = thread.parent_id || undefined
		const parentRoomID = select("channel_room", "room_id", {channel_id: channelID}).pluck().get()
		if (!parentRoomID) return // Not interested in a thread if we aren't interested in its wider channel (won't autocreate)
		const threadRoomID = await createRoom.syncRoom(thread.id) // Create room (will share the same inflight as the initial message to the thread)
		await announceThread.announceThread(parentRoomID, threadRoomID, thread)
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {DiscordTypes.GatewayGuildUpdateDispatchData} guild
	 */
	async GUILD_UPDATE(client, guild) {
		const spaceID = select("guild_space", "space_id", {guild_id: guild.id}).pluck().get()
		if (!spaceID) return
		await createSpace.syncSpace(guild)
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {DiscordTypes.GatewayChannelUpdateDispatchData} channelOrThread
	 */
	async CHANNEL_UPDATE(client, channelOrThread) {
		const roomID = select("channel_room", "room_id", {channel_id: channelOrThread.id}).pluck().get()
		if (!roomID) return // No target room to update the data on
		await createRoom.syncRoom(channelOrThread.id)
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {DiscordTypes.GatewayChannelUpdateDispatchData} thread
	 */
	async THREAD_UPDATE(client, thread) {
		await module.exports.CHANNEL_UPDATE(client, thread)
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {DiscordTypes.GatewayChannelPinsUpdateDispatchData} data
	 */
	async CHANNEL_PINS_UPDATE(client, data) {
		const roomID = select("channel_room", "room_id", {channel_id: data.channel_id}).pluck().get()
		if (!roomID) return // No target room to update pins in
		const convertedTimestamp = updatePins.convertTimestamp(data.last_pin_timestamp)
		await updatePins.updatePins(data.channel_id, roomID, convertedTimestamp)
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {DiscordTypes.GatewayChannelDeleteDispatchData} channel
	 */
	async CHANNEL_DELETE(client, channel) {
		const guildID = channel["guild_id"]
		if (!guildID) return // channel must have been a DM channel or something
		const roomID = select("channel_room", "room_id", {channel_id: channel.id}).pluck().get()
		if (!roomID) return // channel wasn't being bridged in the first place
		// @ts-ignore
		await createRoom.unbridgeDeletedChannel(channel, guildID)
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {DiscordTypes.GatewayMessageCreateDispatchData} message
	 */
	async MESSAGE_CREATE(client, message) {
		if (message.author.username === "Deleted User") return // Nothing we can do for deleted users.
		const channel = client.channels.get(message.channel_id)
		if (!channel || !("guild_id" in channel) || !channel.guild_id) return // Nothing we can do in direct messages.

		const guild = client.guilds.get(channel.guild_id)
		assert(guild)

		if (message.webhook_id) {
			const row = select("webhook", "webhook_id", {webhook_id: message.webhook_id}).pluck().get()
			if (row) return // The message was sent by the bridge's own webhook on discord. We don't want to reflect this back, so just drop it.
		}

		if (dUtils.isEphemeralMessage(message)) return // Ephemeral messages are for the eyes of the receiver only!

		if (!createRoom.existsOrAutocreatable(channel, guild.id)) return // Check that the sending-to room exists or is autocreatable

		const {affected, row} = await speedbump.maybeDoSpeedbump(message.channel_id, message.id)
		if (affected) return

		// @ts-ignore
		await sendMessage.sendMessage(message, channel, guild, row)

		retrigger.messageFinishedBridging(message.id)
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {DiscordTypes.GatewayMessageUpdateDispatchData} data
	 */
	async MESSAGE_UPDATE(client, data) {
		// Based on looking at data they've sent me over the gateway, this is the best way to check for meaningful changes.
		// If the message content is a string then it includes all interesting fields and is meaningful.
		// Otherwise, if there are embeds, then the system generated URL preview embeds.
		if (!(typeof data.content === "string" || "embeds" in data)) return

		if (data.webhook_id) {
			const row = select("webhook", "webhook_id", {webhook_id: data.webhook_id}).pluck().get()
			if (row) return // The message was sent by the bridge's own webhook on discord. We don't want to reflect this back, so just drop it.
		}

		if (dUtils.isEphemeralMessage(data)) return // Ephemeral messages are for the eyes of the receiver only!

		// Edits need to go through the speedbump as well. If the message is delayed but the edit isn't, we don't have anything to edit from.
		const {affected, row} = await speedbump.maybeDoSpeedbump(data.channel_id, data.id)
		if (affected) return

		// Check that the sending-to room exists, and deal with Eventual Consistency(TM)
		if (retrigger.eventNotFoundThenRetrigger(data.id, module.exports.MESSAGE_UPDATE, client, data)) return

		/** @type {DiscordTypes.GatewayMessageCreateDispatchData} */
		// @ts-ignore
		const message = data
		const channel = client.channels.get(message.channel_id)
		if (!channel || !("guild_id" in channel) || !channel.guild_id) return // Nothing we can do in direct messages.
		const guild = client.guilds.get(channel.guild_id)
		assert(guild)

		// @ts-ignore
		await retrigger.pauseChanges(message.id, editMessage.editMessage(message, guild, row))
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {DiscordTypes.GatewayMessageReactionAddDispatchData} data
	 */
	async MESSAGE_REACTION_ADD(client, data) {
		if (data.user_id === client.user.id) return // m2d reactions are added by the discord bot user - do not reflect them back to matrix.
		await addReaction.addReaction(data)
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {DiscordTypes.GatewayMessageReactionRemoveDispatchData | DiscordTypes.GatewayMessageReactionRemoveEmojiDispatchData | DiscordTypes.GatewayMessageReactionRemoveAllDispatchData} data
	 */
	async onSomeReactionsRemoved(client, data) {
		await removeReaction.removeSomeReactions(data)
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {DiscordTypes.GatewayMessageDeleteDispatchData} data
	 */
	async MESSAGE_DELETE(client, data) {
		speedbump.onMessageDelete(data.id)
		if (retrigger.eventNotFoundThenRetrigger(data.id, module.exports.MESSAGE_DELETE, client, data)) return
		await deleteMessage.deleteMessage(data)
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {DiscordTypes.GatewayMessageDeleteBulkDispatchData} data
	 */
	async MESSAGE_DELETE_BULK(client, data) {
		await deleteMessage.deleteMessageBulk(data)
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {DiscordTypes.GatewayTypingStartDispatchData} data
	 */
	async TYPING_START(client, data) {
		const roomID = select("channel_room", "room_id", {channel_id: data.channel_id}).pluck().get()
		if (!roomID) return
		const mxid = from("sim").join("sim_member", "mxid").where({user_id: data.user_id, room_id: roomID}).pluck("mxid").get()
		if (!mxid) return
		// Each Discord user triggers the notification every 8 seconds as long as they remain typing.
		// Discord does not send typing stopped events, so typing only stops if the timeout is reached or if the user sends their message.
		// (We have to manually stop typing on Matrix-side when the message is sent. This is part of the send action.)
		await api.sendTyping(roomID, true, mxid, 10000)
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {DiscordTypes.GatewayGuildEmojisUpdateDispatchData} data
	 */
	async GUILD_EMOJIS_UPDATE(client, data) {
		await createSpace.syncSpaceExpressions(data, false)
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {DiscordTypes.GatewayGuildStickersUpdateDispatchData} data
	 */
	async GUILD_STICKERS_UPDATE(client, data) {
		await createSpace.syncSpaceExpressions(data, false)
	},

	/**
	 * @param {import("./discord-client")} client
	 * @param {DiscordTypes.GatewayPresenceUpdateDispatchData} data
	 */
	PRESENCE_UPDATE(client, data) {
		const status = data.status
		if (!status) return
		setPresence.presenceTracker.incomingPresence(data.user.id, data.guild_id, status)
	}
}
