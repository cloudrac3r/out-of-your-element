// @ts-check

// Discord library internals type beat

const DiscordTypes = require("discord-api-types/v10")
const passthrough = require("../passthrough")
const { sync } = passthrough

const utils = {
	/**
	 * @param {import("./discord-client")} client
	 * @param {import("cloudstorm").IGatewayMessage} message
	 */
	async onPacket(client, message) {
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
			eventDispatcher.checkMissedMessages(client, message.d)


		} else if (message.t === "CHANNEL_UPDATE" || message.t === "THREAD_UPDATE") {
			client.channels.set(message.d.id, message.d)


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
		try {
			if (message.t === "CHANNEL_UPDATE") {
				await eventDispatcher.onChannelOrThreadUpdate(client, message.d, false)

			} else if (message.t === "THREAD_UPDATE") {
				await eventDispatcher.onChannelOrThreadUpdate(client, message.d, true)

			} else if (message.t === "MESSAGE_CREATE") {
				await eventDispatcher.onMessageCreate(client, message.d)

			} else if (message.t === "MESSAGE_UPDATE") {
				await eventDispatcher.onMessageUpdate(client, message.d)

			} else if (message.t === "MESSAGE_DELETE") {
				await eventDispatcher.onMessageDelete(client, message.d)

			} else if (message.t === "MESSAGE_REACTION_ADD") {
				await eventDispatcher.onReactionAdd(client, message.d)
			}
		} catch (e) {
			// Let OOYE try to handle errors too
			eventDispatcher.onError(client, e, message)
		}
	}
}

module.exports = utils
