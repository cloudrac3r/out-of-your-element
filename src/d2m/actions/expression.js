// @ts-check

const DiscordTypes = require("discord-api-types/v10")

const passthrough = require("../../passthrough")
const {sync, db} = passthrough
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")

/**
 * @param {DiscordTypes.APIEmoji[]} emojis
 */
async function emojisToState(emojis) {
	const result = {
		pack: {
			display_name: "Discord Emojis",
			usage: ["emoticon"] // we'll see...
		},
		images: {
		}
	}
	await Promise.all(emojis.map(emoji =>
		// the homeserver can probably cope with doing this in parallel
		file.uploadDiscordFileToMxc(file.emoji(emoji.id, emoji.animated)).then(url => {
			result.images[emoji.name] = {
				info: {
					mimetype: emoji.animated ? "image/gif" : "image/png"
				},
				url
			}
			db.prepare("INSERT OR IGNORE INTO emoji (emoji_id, name, animated, mxc_url) VALUES (?, ?, ?, ?)").run(emoji.id, emoji.name, +!!emoji.animated, url)
		}).catch(e => {
			if (e.data?.errcode === "M_TOO_LARGE") { // Very unlikely to happen. Only possible for 3x-series emojis uploaded shortly after animated emojis were introduced, when there was no 256 KB size limit.
				return
			}
			console.error(`Trying to handle emoji ${emoji.name} (${emoji.id}), but...`)
			throw e
		})
	))
	return result
}

/**
 * @param {DiscordTypes.APISticker[]} stickers
 */
async function stickersToState(stickers) {
	const result = {
		pack: {
			display_name: "Discord Stickers",
			usage: ["sticker"] // we'll see...
		},
		images: {
		}
	}
	const shortcodes = []
	await Promise.all(stickers.map(sticker =>
		// the homeserver can probably cope with doing this in parallel
		file.uploadDiscordFileToMxc(file.sticker(sticker)).then(url => {

			/** @type {string | undefined} */
			let body = sticker.name
			if (sticker && sticker.description) body += ` - ${sticker.description}`
			if (!body) body = undefined

			let shortcode = sticker.name.toLowerCase().replace(/[^a-zA-Z0-9_-]/g, "-").replace(/^-|-$/g, "").replace(/--+/g, "-")
			while (shortcodes.includes(shortcode)) shortcode = shortcode + "~"
			shortcodes.push(shortcode)

			result.images[shortcode] = {
				info: {
					mimetype: file.stickerFormat.get(sticker.format_type)?.mime || "image/png"
				},
				body,
				url
			}
		})
	))
	return result
}

module.exports.emojisToState = emojisToState
module.exports.stickersToState = stickersToState
