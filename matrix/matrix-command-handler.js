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
	return function(event, ctx = {}) {
		ctx["m.relates_to"] = {
			"m.in_reply_to": {
				event_id: event.event_id
			}
		}
		return execute(event, ctx)
	}
}

const NEWLINE_ELEMENTS = mxUtils.BLOCK_ELEMENTS.concat(["BR"])

class MatrixStringBuilder {
	constructor() {
		this.body = ""
		this.formattedBody = ""
	}

	/**
	 * @param {string} body
	 * @param {string} formattedBody
	 * @param {any} [condition]
	 */
	add(body, formattedBody, condition = true) {
		if (condition) {
			if (!formattedBody) formattedBody = body
			this.body += body
			this.formattedBody += formattedBody
		}
		return this
	}

	/**
	 * @param {string} body
	 * @param {string} [formattedBody]
	 * @param {any} [condition]
	 */
	addLine(body, formattedBody, condition = true) {
		if (condition) {
			if (!formattedBody) formattedBody = body
			if (this.body.length && this.body.slice(-1) !== "\n") this.body += "\n"
			this.body += body
			const match = this.formattedBody.match(/<\/?([a-zA-Z]+[a-zA-Z0-9]*)[^>]*>\s*$/)
			if (this.formattedBody.length && (!match || !NEWLINE_ELEMENTS.includes(match[1].toUpperCase()))) this.formattedBody += "<br>"
			this.formattedBody += formattedBody
		}
		return this
	}

	get() {
		return {
			msgtype: "m.text",
			body: this.body,
			format: "org.matrix.custom.html",
			formatted_body: this.formattedBody
		}
	}
}

/** @type {Command[]} */
const commands = [{
	aliases: ["emoji"],
	execute: replyctx(
		async (event, ctx) => {
			// Guard
			/** @type {string} */ // @ts-ignore
			const channelID = select("channel_room", "channel_id", "WHERE room_id = ?").pluck().get(event.room_id)
			const guildID = discord.channels.get(channelID)?.["guild_id"]
			let matrixOnlyReason = null
			const matrixOnlyConclusion = "So the emoji will be uploaded on Matrix-side only. It will still be usable over the bridge, but may have degraded functionality."
			if (!guildID) {
				matrixOnlyReason = "NOT_BRIDGED"
			} else {
				const guild = discord.guilds.get(guildID)
				assert(guild)
				const slots = getSlotCount(guild.premium_tier)
				const permissions = dUtils.getPermissions([], guild.roles)
				if (guild.emojis.length >= slots) {
					matrixOnlyReason = "CAPACITY"
				} else if (!(permissions | 0x40000000n)) { // MANAGE_GUILD_EXPRESSIONS (apparently CREATE_GUILD_EXPRESSIONS isn't good enough...)
					matrixOnlyReason = "USER_PERMISSIONS"
				}
			}

			const nameMatch = event.content.body.match(/:([a-zA-Z0-9_]{2,}):/)
			if (!nameMatch) {
				return api.sendEvent(event.room_id, "m.room.message", {
					...ctx,
					msgtype: "m.text",
					body: "Not sure what you want to call this emoji. Try writing a new :name: in colons. The name can have letters, numbers, and underscores."
				})
			}
			const name = nameMatch[1]

			let mxc
			const mxcMatch = event.content.body.match(/(mxc:\/\/.*?)\b/)
			if (mxcMatch) {
				mxc = mxcMatch[1]
			}
			if (!mxc && event.content["m.relates_to"]?.["m.in_reply_to"]?.event_id) {
				const repliedToEventID = event.content["m.relates_to"]["m.in_reply_to"].event_id
				const repliedToEvent = await api.getEvent(event.room_id, repliedToEventID)
				if (repliedToEvent.type === "m.room.message" && repliedToEvent.content.msgtype === "m.image" && repliedToEvent.content.url) {
					mxc = repliedToEvent.content.url
				}
			}
			if (!mxc) {
				return api.sendEvent(event.room_id, "m.room.message", {
					...ctx,
					msgtype: "m.text",
					body: "Not sure what image you wanted to add. Try replying to an uploaded image when you use the command, or write an mxc:// URL in your message."
				})
			}

			const sent = await api.sendEvent(event.room_id, "m.room.message", {
				...ctx,
				...new MatrixStringBuilder()
					.addLine("## Emoji preview", "<h2>Emoji preview</h2>")
					.addLine(`Ⓜ️ This room isn't bridged to Discord. ${matrixOnlyConclusion}`, `Ⓜ️ <em>This room isn't bridged to Discord. ${matrixOnlyConclusion}</em>`, matrixOnlyReason === "NOT_BRIDGED")
					.addLine(`Ⓜ️ *Discord ran out of space for emojis. ${matrixOnlyConclusion}`, `Ⓜ️ <em>Discord ran out of space for emojis. ${matrixOnlyConclusion}</em>`, matrixOnlyReason === "CAPACITY")
					.addLine(`Ⓜ️ *If you were a Discord user, you wouldn't have permission to create emojis. ${matrixOnlyConclusion}`, `Ⓜ️ <em>If you were a Discord user, you wouldn't have permission to create emojis. ${matrixOnlyConclusion}</em>`, matrixOnlyReason === "CAPACITY")
					.addLine("[Preview not available in plain text.]", `Preview: <img data-mx-emoticon height="48" src="${mxc} title=":${name}:" alt=":${name}:">`)
					.addLine("Hit ✅ to add it.")
					.get()
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
					pack.images[name] = {
						url: mxc // Directly use the same file that the Matrix user uploaded. Don't need to worry about dimensions/filesize because clients already request their preferred resized version from the homeserver.
					}
					api.sendEvent(event.room_id, "m.room.message", {
						...ctx,
						...new MatrixStringBuilder()
							.addLine(`Created :${name}:`, `<img data-mx-emoticon height="48" src="${mxc}" title=":${name}:" alt=":${name}:">`)
							.get()
					})
				} else {
					// Upload it to Discord and have the bridge sync it back to Matrix again
					const publicUrl = mxUtils.getPublicUrlForMxc(mxc)
					// @ts-ignore
					const resizeInput = await fetch(publicUrl, {agent: false}).then(res => res.arrayBuffer())
					const resizeOutput = await sharp(resizeInput)
						.resize(EMOJI_SIZE, EMOJI_SIZE, {fit: "inside", withoutEnlargement: true, background: {r: 0, g: 0, b: 0, alpha: 0}})
						.png()
						.toBuffer({resolveWithObject: true})
					console.log(`uploading emoji ${resizeOutput.data.length} bytes to :${name}:`)
					const emoji = await discord.snow.guildAssets.createEmoji(guildID, {name, image: "data:image/png;base64," + resizeOutput.data.toString("base64")})
					api.sendEvent(event.room_id, "m.room.message", {
						...ctx,
						msgtype: "m.text",
						body: `Created :${name}:`
					})
				}
			})
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

	await command.execute(event)
}

module.exports.execute = execute
module.exports.onReactionAdd = onReactionAdd
