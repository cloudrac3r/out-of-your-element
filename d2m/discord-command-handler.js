// @ts-check

const assert = require("assert").strict
const util = require("util")
const DiscordTypes = require("discord-api-types/v10")
const {discord, sync, db} = require("../passthrough")
/** @type {import("../matrix/api")}) */
const api = sync.require("../matrix/api")
/** @type {import("../matrix/file")} */
const file = sync.require("../matrix/file")

const PREFIX = "//"

let buttons = []

/**
 * @param {string} channelID where to add the button
 * @param {string} messageID where to add the button
 * @param {string} emoji emoji to add as a button
 * @param {string} userID only listen for responses from this user
 * @returns {Promise<import("discord-api-types/v10").GatewayMessageReactionAddDispatchData>}
 */
async function addButton(channelID, messageID, emoji, userID) {
	await discord.snow.channel.createReaction(channelID, messageID, emoji)
	return new Promise(resolve => {
		buttons.push({channelID, messageID, userID, resolve, created: Date.now()})
	})
}

// Clear out old buttons every so often to free memory
setInterval(() => {
	const now = Date.now()
	buttons = buttons.filter(b => now - b.created < 2*60*60*1000)
}, 10*60*1000)

/** @param {import("discord-api-types/v10").GatewayMessageReactionAddDispatchData} data */
function onReactionAdd(data) {
	const button = buttons.find(b => b.channelID === data.channel_id && b.messageID === data.message_id && b.userID === data.user_id)
	if (button) {
		buttons = buttons.filter(b => b !== button) // remove button data so it can't be clicked again
		button.resolve(data)
	}
}

/**
 * @callback CommandExecute
 * @param {DiscordTypes.GatewayMessageCreateDispatchData} message
 * @param {DiscordTypes.APIGuildTextChannel} channel
 * @param {DiscordTypes.APIGuild} guild
 * @param {Partial<DiscordTypes.RESTPostAPIChannelMessageJSONBody>} [ctx]
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
			// Guard
			const roomID = db.prepare("SELECT room_id FROM channel_room WHERE channel_id = ?").pluck().get(channel.id)
			if (!roomID) return discord.snow.channel.createMessage(channel.id, {
				...ctx,
				content: "This channel isn't bridged to the other side."
			})

			// Current avatar
			const avatarEvent = await api.getStateEvent(roomID, "m.room.avatar", "")
			const avatarURLParts = avatarEvent?.url.match(/^mxc:\/\/([^/]+)\/(\w+)$/)
			let currentAvatarMessage =
				( avatarURLParts ? `Current room-specific avatar: https://matrix.cadence.moe/_matrix/media/r0/download/${avatarURLParts[1]}/${avatarURLParts[2]}`
				: "No avatar. Now's your time to strike. Use `//icon` again with a link or upload to set the room-specific avatar.")

			// Next potential avatar
			const nextAvatarURL = message.attachments.find(a => a.content_type?.startsWith("image/"))?.url || message.content.match(/https?:\/\/[^ ]+\.[^ ]+\.(?:png|jpg|jpeg|webp)\b/)?.[0]
			let nextAvatarMessage =
				( nextAvatarURL ? `\nYou want to set it to: ${nextAvatarURL}\nHit ✅ to make it happen.`
				: "")

			const sent = await discord.snow.channel.createMessage(channel.id, {
				...ctx,
				content: currentAvatarMessage + nextAvatarMessage
			})

			if (nextAvatarURL) {
				addButton(channel.id, sent.id, "✅", message.author.id).then(async data => {
					const mxcUrl = await file.uploadDiscordFileToMxc(nextAvatarURL)
					await api.sendState(roomID, "m.room.avatar", "", {
						url: mxcUrl
					})
					db.prepare("UPDATE channel_room SET custom_avatar = ? WHERE channel_id = ?").run(mxcUrl, channel.id)
					await discord.snow.channel.createMessage(channel.id, {
						...ctx,
						content: "Your creation is unleashed. Any complaints will be redirected to Grelbo."
					})
				})
			}
		}
	)
}, {
	aliases: ["invite"],
	execute: replyctx(
		async (message, channel, guild, ctx) => {
			return discord.snow.channel.createMessage(channel.id, {
				...ctx,
				content: "This command isn't implemented yet."
			})
		}
	)
}]

/** @type {CommandExecute} */
async function execute(message, channel, guild) {
	if (!message.content.startsWith(PREFIX)) return
	const words = message.content.slice(PREFIX.length).split(" ")
	const commandName = words[0]
	const command = commands.find(c => c.aliases.includes(commandName))
	if (!command) return

	await command.execute(message, channel, guild)
}

module.exports.execute = execute
module.exports.onReactionAdd = onReactionAdd
