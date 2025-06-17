// @ts-check

const assert = require("assert").strict
const Ty = require("../types")
const {pipeline} = require("stream").promises
const sharp = require("sharp")

const {discord, sync, db, select} = require("../passthrough")
/** @type {import("./api")}) */
const api = sync.require("./api")
/** @type {import("../m2d/converters/utils")} */
const mxUtils = sync.require("../m2d/converters/utils")
/** @type {import("../discord/utils")} */
const dUtils = sync.require("../discord/utils")
/** @type {import("./kstate")} */
const ks = sync.require("./kstate")
const {reg} = require("./read-registration")

const PREFIXES = ["//", "/"]

const EMOJI_SIZE = 128

/** This many normal emojis + this many animated emojis. The total number is doubled. */
const TIER_EMOJI_SLOTS = new Map([
	[1, 100],
	[2, 150],
	[3, 250]
])

/** @param {number} tier */
function getSlotCount(tier) {
	return TIER_EMOJI_SLOTS.get(tier) || 50
}

let buttons = []

/**
 * @param {string} roomID where to add the button
 * @param {string} eventID where to add the button
 * @param {string} key emoji to add as a button
 * @param {string} mxid only listen for responses from this user
 * @returns {Promise<import("discord-api-types/v10").GatewayMessageReactionAddDispatchData>}
 */
async function addButton(roomID, eventID, key, mxid) {
	await api.sendEvent(roomID, "m.reaction", {
		"m.relates_to": {
			rel_type: "m.annotation",
			event_id: eventID,
			key
		}
	})
	return new Promise(resolve => {
		buttons.push({roomID, eventID, mxid, key, resolve, created: Date.now()})
	})
}

// Clear out old buttons every so often to free memory
setInterval(() => {
	const now = Date.now()
	buttons = buttons.filter(b => now - b.created < 2*60*60*1000)
}, 10*60*1000)

/** @param {Ty.Event.Outer<Ty.Event.M_Reaction>} event */
function onReactionAdd(event) {
	const button = buttons.find(b => b.roomID === event.room_id && b.mxid === event.sender && b.eventID === event.content["m.relates_to"]?.event_id && b.key === event.content["m.relates_to"]?.key)
	if (button) {
		buttons = buttons.filter(b => b !== button) // remove button data so it can't be clicked again
		button.resolve(event)
	}
}

/**
 * @callback CommandExecute
 * @param {Ty.Event.Outer_M_Room_Message} event
 * @param {string} realBody
 * @param {string[]} words
 * @param {any} [ctx]
 */

/**
 * @typedef Command
 * @property {string[]} aliases
 * @property {CommandExecute} execute
 */

/** @param {CommandExecute} execute */
function replyctx(execute) {
	/** @type {CommandExecute} */
	return function(event, realBody, words, ctx = {}) {
		ctx["m.relates_to"] = {
			"m.in_reply_to": {
				event_id: event.event_id
			}
		}
		return execute(event, realBody, words, ctx)
	}
}

/** @type {Command[]} */
const commands = [{
	aliases: ["emoji"],
	execute: replyctx(
		async (event, realBody, words, ctx) => {
			// Guard
			/** @type {string} */ // @ts-ignore
			const channelID = select("channel_room", "channel_id", {room_id: event.room_id}).pluck().get()
			const guildID = discord.channels.get(channelID)?.["guild_id"]
			let matrixOnlyReason = null
			const matrixOnlyConclusion = "So the emoji will be uploaded on Matrix-side only. It will still be usable over the bridge, but may have degraded functionality."
			// Check if we can/should upload to Discord, for various causes
			if (!guildID) {
				matrixOnlyReason = "NOT_BRIDGED"
			} else {
				const guild = discord.guilds.get(guildID)
				assert(guild)
				const slots = getSlotCount(guild.premium_tier)
				const permissions = dUtils.getPermissions([], guild.roles)
				if (guild.emojis.length >= slots) {
					matrixOnlyReason = "CAPACITY"
				} else if (!(permissions & 0x40000000n)) { // MANAGE_GUILD_EXPRESSIONS (apparently CREATE_GUILD_EXPRESSIONS isn't good enough...)
					matrixOnlyReason = "USER_PERMISSIONS"
				}
			}
			if (matrixOnlyReason) {
				// If uploading to Matrix, check if we have permission
				const state = await api.getAllState(event.room_id)
				const kstate = ks.stateToKState(state)
				const powerLevels = kstate["m.room.power_levels/"]
				const required = powerLevels.events["im.ponies.room_emotes"] ?? powerLevels.state_default ?? 50
				const have = powerLevels.users[`@${reg.sender_localpart}:${reg.ooye.server_name}`] ?? powerLevels.users_default ?? 0
				if (have < required) {
					return api.sendEvent(event.room_id, "m.room.message", {
						...ctx,
						msgtype: "m.text",
						body: "I don't have sufficient permissions in this Matrix room to edit emojis."
					})
				}
			}

			/** @type {{url: string, name: string}[]} */
			const toUpload = []
			const nameMatch = realBody.match(/:([a-zA-Z0-9_]{2,}):/)
			const mxcMatch = realBody.match(/(mxc:\/\/.*?)\b/)
			if (event.content["m.relates_to"]?.["m.in_reply_to"]?.event_id) {
				const repliedToEventID = event.content["m.relates_to"]["m.in_reply_to"].event_id
				const repliedToEvent = await api.getEvent(event.room_id, repliedToEventID)
				if (nameMatch && repliedToEvent.type === "m.room.message" && repliedToEvent.content.msgtype === "m.image" && repliedToEvent.content.url) {
					toUpload.push({url: repliedToEvent.content.url, name: nameMatch[1]})
				} else if (repliedToEvent.type === "m.room.message" && repliedToEvent.content.msgtype === "m.text" && "formatted_body" in repliedToEvent.content) {
					const namePrefixMatch = realBody.match(/:([a-zA-Z0-9_]{2,})(?:\b|:)/)
					const imgMatches = [...repliedToEvent.content.formatted_body.matchAll(/<img [^>]*>/g)]
					for (const match of imgMatches) {
						const e = match[0]
						const url = e.match(/src="([^"]*)"/)?.[1]
						let name = e.match(/title=":?([^":]*):?"/)?.[1]
						if (!url || !name) continue
						if (namePrefixMatch) name = namePrefixMatch[1] + name
						toUpload.push({url, name})
					}
				}
			}
			if (!toUpload.length && mxcMatch && nameMatch) {
				toUpload.push({url: mxcMatch[1], name: nameMatch[1]})
			}
			if (!toUpload.length) {
				return api.sendEvent(event.room_id, "m.room.message", {
					...ctx,
					msgtype: "m.text",
					body: "Not sure what image you wanted to add. Try replying to an uploaded image when you use the command, or write an mxc:// URL in your message. You should specify the new name :like_this:."
				})
			}

			const b = new mxUtils.MatrixStringBuilder()
				.addLine("## Emoji preview", "<h2>Emoji preview</h2>")
				.addLine(`Ⓜ️ This room isn't bridged to Discord. ${matrixOnlyConclusion}`, `Ⓜ️ <em>This room isn't bridged to Discord. ${matrixOnlyConclusion}</em>`, matrixOnlyReason === "NOT_BRIDGED")
				.addLine(`Ⓜ️ *Discord ran out of space for emojis. ${matrixOnlyConclusion}`, `Ⓜ️ <em>Discord ran out of space for emojis. ${matrixOnlyConclusion}</em>`, matrixOnlyReason === "CAPACITY")
				.addLine(`Ⓜ️ *If you were a Discord user, you wouldn't have permission to create emojis. ${matrixOnlyConclusion}`, `Ⓜ️ <em>If you were a Discord user, you wouldn't have permission to create emojis. ${matrixOnlyConclusion}</em>`, matrixOnlyReason === "CAPACITY")
				.addLine("[Preview not available in plain text.]", "Preview:")
			for (const e of toUpload) {
				b.add("", `<img data-mx-emoticon height="48" src="${e.url}" title=":${e.name}:" alt=":${e.name}:">`)
			}
			b.addLine("Hit ✅ to add it.")
			const sent = await api.sendEvent(event.room_id, "m.room.message", {
				...ctx,
				...b.get()
			})
			addButton(event.room_id, sent, "✅", event.sender).then(async () => {
				if (matrixOnlyReason) {
					// Edit some state
					const type = "im.ponies.room_emotes"
					const key = "moe.cadence.ooye.pack.matrix"
					let pack
					try {
						pack = await api.getStateEvent(event.room_id, type, key)
					} catch (e) {
						pack = {
							pack: {
								display_name: "Non-Discord Emojis",
								usage: ["emoticon", "sticker"]
							}
						}
					}
					if (!("images" in pack)) pack.images = {}
					const b = new mxUtils.MatrixStringBuilder()
						.addLine(`Created ${toUpload.length} emojis`, "")
					for (const e of toUpload) {
						pack.images[e.name] = {
							url: e.url // Directly use the same file that the Matrix user uploaded. Don't need to worry about dimensions/filesize because clients already request their preferred resized version from the homeserver.
						}
						b.add("", `<img data-mx-emoticon height="48" src="${e.url}" title=":${e.name}:" alt=":${e.name}:">`)
					}
					await api.sendState(event.room_id, type, key, pack)
					api.sendEvent(event.room_id, "m.room.message", {
						...ctx,
						...b.get()
					})
				} else {
					// Upload it to Discord and have the bridge sync it back to Matrix again
					for (const e of toUpload) {
						// @ts-ignore
						const resizeInput = await api.getMedia(e.url, {agent: false}).then(res => res.arrayBuffer())
						const resizeOutput = await sharp(resizeInput)
							.resize(EMOJI_SIZE, EMOJI_SIZE, {fit: "inside", withoutEnlargement: true, background: {r: 0, g: 0, b: 0, alpha: 0}})
							.png()
							.toBuffer({resolveWithObject: true})
						console.log(`uploading emoji ${resizeOutput.data.length} bytes to :${e.name}:`)
						await discord.snow.assets.createGuildEmoji(guildID, {name: e.name, image: "data:image/png;base64," + resizeOutput.data.toString("base64")})
					}
					api.sendEvent(event.room_id, "m.room.message", {
						...ctx,
						msgtype: "m.text",
						body: `Created ${toUpload.length} emojis`
					})
				}
			})
		}
	)
}, {
	aliases: ["thread"],
	execute: replyctx(
		async (event, realBody, words, ctx) => {
			// Guard
			/** @type {string} */ // @ts-ignore
			const channelID = select("channel_room", "channel_id", {room_id: event.room_id}).pluck().get()
			const guildID = discord.channels.get(channelID)?.["guild_id"]
			if (!guildID) {
				return api.sendEvent(event.room_id, "m.room.message", {
					...ctx,
					msgtype: "m.text",
					body: "This room isn't bridged to the other side."
				})
			}

			const guild = discord.guilds.get(guildID)
			assert(guild)
			const permissions = dUtils.getPermissions([], guild.roles)
			if (!(permissions & 0x800000000n)) { // CREATE_PUBLIC_THREADS
				return api.sendEvent(event.room_id, "m.room.message", {
					...ctx,
					msgtype: "m.text",
					body: "This command creates a thread on Discord. But you aren't allowed to do this, because if you were a Discord user, you wouldn't have the Create Public Threads permission."
				})
			}

			await discord.snow.channel.createThreadWithoutMessage(channelID, {type: 11, name: words.slice(1).join(" ")})
		}
	)
}]


/** @type {CommandExecute} */
async function execute(event) {
	let realBody = event.content.body
	while (realBody.startsWith("> ")) {
		const i = realBody.indexOf("\n")
		if (i === -1) return
		realBody = realBody.slice(i + 1)
	}
	realBody = realBody.replace(/^\s*/, "")
	let words
	for (const prefix of PREFIXES) {
		if (realBody.startsWith(prefix)) {
			words = realBody.slice(prefix.length).split(" ")
			break
		}
	}
	if (!words) return
	const commandName = words[0]
	const command = commands.find(c => c.aliases.includes(commandName))
	if (!command) return

	await command.execute(event, realBody, words)
}

module.exports.execute = execute
module.exports.onReactionAdd = onReactionAdd
