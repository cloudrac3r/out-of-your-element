// @ts-check

const assert = require("assert").strict
const util = require("util")
const DiscordTypes = require("discord-api-types/v10")
const {discord, sync, db} = require("../passthrough")
/** @type {import("../matrix/api")}) */
const api = sync.require("../matrix/api")

const prefix = "/"

/**
 * @callback CommandExecute
 * @param {DiscordTypes.GatewayMessageCreateDispatchData} message
 * @param {DiscordTypes.APIGuildTextChannel} channel
 * @param {DiscordTypes.APIGuild} guild
 * @param {any} [ctx]
 */

/**
 * @typedef Command
 * @property {string[]} aliases
 * @property {(message: DiscordTypes.GatewayMessageCreateDispatchData, channel: DiscordTypes.APIGuildTextChannel, guild: DiscordTypes.APIGuild) => Promise<any>} execute
 */

/** @param {CommandExecute} execute */
function replyctx(execute) {
	/** @type {CommandExecute} */
	return function(message, channel, guild, ctx = {}) {
		ctx.message_reference = {
			message_id: message.id,
			channel_id: channel.id,
			guild_id: guild.id,
			fail_if_not_exists: false
		}
		return execute(message, channel, guild, ctx)
	}
}

/** @type {Command[]} */
const commands = [{
	aliases: ["icon", "avatar", "roomicon", "roomavatar", "channelicon", "channelavatar"],
	execute: replyctx(
		async (message, channel, guild, ctx) => {
			const roomID = db.prepare("SELECT room_id FROM channel_room WHERE channel_id = ?").pluck().get(channel.id)
			if (!roomID) return discord.snow.channel.createMessage(channel.id, {
				...ctx,
				content: "This channel isn't bridged to the other side."
			})
			const avatarEvent = await api.getStateEvent(roomID, "m.room.avatar", "")
			const avatarURL = avatarEvent?.url
			return discord.snow.channel.createMessage(channel.id, {
				...ctx,
				content: `Current room avatar: ${avatarURL}`
			})
		}
	)
}, {
	aliases: ["invite"],
	execute: replyctx(
		async (message, channel, guild, ctx) => {
			discord.snow.channel.createMessage(channel.id, {
				...ctx,
				content: "This command isn't implemented yet."
			})
		}
	)
}]

/** @type {CommandExecute} */
async function execute(message, channel, guild) {
	if (!message.content.startsWith(prefix)) return
	const words = message.content.split(" ")
	const commandName = words[0]
	const command = commands.find(c => c.aliases.includes(commandName))
	if (!command) return

	await command.execute(message, channel, guild)
}

module.exports.execute = execute
