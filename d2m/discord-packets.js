// @ts-check

// Discord library internals type beat

const DiscordTypes = require("discord-api-types/v10")
const passthrough = require("../passthrough")
const { sync } = passthrough

const utils = {
	/**
	 * @param {import("./discord-client")} client
	 * @param {import("cloudstorm").IGatewayMessage} message
	 * @param {string} listen "full", "half", "no" - whether to set up the event listeners for OOYE to operate
	 */
	async onPacket(client, message, listen) {
		// requiring this later so that the client is already constructed by the time event-dispatcher is loaded
		/** @type {typeof import("./event-dispatcher")} */
		const eventDispatcher = sync.require("./event-dispatcher")

		// Client internals, keep track of the state we need
		if (message.t === "READY") {
			if (client.ready) return
			client.ready = true
			client.user = message.d.user
			client.application = message.d.application
			console.log(`Discord logged in as ${client.user.username}#${client.user.discriminator} (${client.user.id})`)

		} else if (message.t === "GUILD_CREATE") {
			client.guilds.set(message.d.id, message.d)
			const arr = []
			client.guildChannelMap.set(message.d.id, arr)
			for (const channel of message.d.channels || []) {
				// @ts-ignore
				channel.guild_id = message.d.id
				arr.push(channel.id)
				client.channels.set(channel.id, channel)
			}
			for (const thread of message.d.threads || []) {
				// @ts-ignore
				thread.guild_id = message.d.id
				arr.push(thread.id)
				client.channels.set(thread.id, thread)
			}
			if (listen === "full") {
				eventDispatcher.checkMissedExpressions(message.d)
				eventDispatcher.checkMissedPins(client, message.d)
				eventDispatcher.checkMissedMessages(client, message.d)
			}

		} else if (message.t === "GUILD_UPDATE") {
			const guild = client.guilds.get(message.d.id)
			if (guild) {
				for (const prop of Object.keys(message.d)) {
					if (!["channels", "threads"].includes(prop)) {
						guild[prop] = message.d[prop]
					}
				}
			}

		} else if (message.t === "GUILD_EMOJIS_UPDATE") {
			const guild = client.guilds.get(message.d.guild_id)
			if (guild) {
				guild.emojis = message.d.emojis
			}

		} else if (message.t === "GUILD_STICKERS_UPDATE") {
			const guild = client.guilds.get(message.d.guild_id)
			if (guild) {
				guild.stickers = message.d.stickers
			}

		} else if (message.t === "GUILD_ROLE_CREATE" || message.t === "GUILD_ROLE_UPDATE" || message.t === "GUILD_ROLE_DELETE") {
			const guild = client.guilds.get(message.d.guild_id)
			/** Delete this in case of UPDATE or DELETE */
			const targetID = "role_id" in message.d ? message.d.role_id : message.d.role.id
			/** Add this in case of CREATE or UPDATE */
			const newRoles = []
			if ("role" in message.d) newRoles.push(message.d.role)
			if (guild) {
				const targetIndex = guild.roles.findIndex(r => r.id === targetID)
				if (targetIndex !== -1) {
					// Role already exists. Delete it and maybe replace it.
					guild.roles.splice(targetIndex, 1, ...newRoles)
				} else {
					// Role doesn't already exist.
					guild.roles.push(...newRoles)
				}
			}

		} else if (message.t === "THREAD_CREATE") {
			client.channels.set(message.d.id, message.d)


		} else if (message.t === "CHANNEL_UPDATE" || message.t === "THREAD_UPDATE") {
			client.channels.set(message.d.id, message.d)


		} else if (message.t === "CHANNEL_PINS_UPDATE") {
			const channel = client.channels.get(message.d.channel_id)
			if (channel) {
				channel["last_pin_timestamp"] = message.d.last_pin_timestamp
			}


		} else if (message.t === "GUILD_DELETE") {
			client.guilds.delete(message.d.id)
			const channels = client.guildChannelMap.get(message.d.id)
			if (channels) {
				for (const id of channels) client.channels.delete(id)
			}
			client.guildChannelMap.delete(message.d.id)


		} else if (message.t === "CHANNEL_CREATE" || message.t === "CHANNEL_DELETE") {
			if (message.t === "CHANNEL_CREATE") {
				client.channels.set(message.d.id, message.d)
				if (message.d["guild_id"]) { // obj[prop] notation can be used to access a property without typescript complaining that it doesn't exist on all values something can have
					const channels = client.guildChannelMap.get(message.d["guild_id"])
					if (channels && !channels.includes(message.d.id)) channels.push(message.d.id)
				}
			} else {
				client.channels.delete(message.d.id)
				if (message.d["guild_id"]) {
					const channels = client.guildChannelMap.get(message.d["guild_id"])
					if (channels) {
						const previous = channels.indexOf(message.d.id)
						if (previous !== -1) channels.splice(previous, 1)
					}
				}
			}
		}

		// Event dispatcher for OOYE bridge operations
		if (listen === "full") {
			try {
				if (message.t === "GUILD_UPDATE") {
					await eventDispatcher.onGuildUpdate(client, message.d)

				} else if (message.t === "GUILD_EMOJIS_UPDATE" || message.t === "GUILD_STICKERS_UPDATE") {
					await eventDispatcher.onExpressionsUpdate(client, message.d)

				} else if (message.t === "CHANNEL_UPDATE") {
					await eventDispatcher.onChannelOrThreadUpdate(client, message.d, false)

				} else if (message.t === "CHANNEL_PINS_UPDATE") {
					await eventDispatcher.onChannelPinsUpdate(client, message.d)

				} else if (message.t === "THREAD_CREATE") {
					// @ts-ignore
					await eventDispatcher.onThreadCreate(client, message.d)

				} else if (message.t === "THREAD_UPDATE") {
					await eventDispatcher.onChannelOrThreadUpdate(client, message.d, true)

				} else if (message.t === "MESSAGE_CREATE") {
					await eventDispatcher.onMessageCreate(client, message.d)

				} else if (message.t === "MESSAGE_UPDATE") {
					await eventDispatcher.onMessageUpdate(client, message.d)

				} else if (message.t === "MESSAGE_DELETE") {
					await eventDispatcher.onMessageDelete(client, message.d)

				} else if (message.t === "MESSAGE_DELETE_BULK") {
					await eventDispatcher.onMessageDeleteBulk(client, message.d)

				} else if (message.t === "TYPING_START") {
					await eventDispatcher.onTypingStart(client, message.d)

				} else if (message.t === "MESSAGE_REACTION_ADD") {
					await eventDispatcher.onReactionAdd(client, message.d)

				} else if (message.t === "MESSAGE_REACTION_REMOVE" || message.t === "MESSAGE_REACTION_REMOVE_EMOJI" || message.t === "MESSAGE_REACTION_REMOVE_ALL") {
					await eventDispatcher.onSomeReactionsRemoved(client, message.d)
				}
			} catch (e) {
				// Let OOYE try to handle errors too
				eventDispatcher.onError(client, e, message)
			}
		}
	}
}

module.exports = utils
