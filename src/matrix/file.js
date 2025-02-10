// @ts-check

const passthrough = require("../passthrough")
const {sync, db, select} = passthrough
/** @type {import("./mreq")} */
const mreq = sync.require("./mreq")

const DISCORD_IMAGES_BASE = "https://cdn.discordapp.com"
const IMAGE_SIZE = 1024

/** @type {Map<string, Promise<string>>} */
const inflight = new Map()

/**
 * @param {string} url
 */
function _removeExpiryParams(url) {
	return url.replace(/\?(?:(?:ex|is|sg|hm)=[a-f0-9]+&?)*$/, "")
}

/**
 * @param {string} path or full URL if it's not a Discord CDN file
 */
async function uploadDiscordFileToMxc(path) {
	let url
	if (path.startsWith("http")) {
		url = path
	} else {
		url = DISCORD_IMAGES_BASE + path
	}

	// Discord attachment content is always the same no matter what their ?ex parameter is.
	const urlNoExpiry = _removeExpiryParams(url)

	// Are we uploading this file RIGHT NOW? Return the same inflight promise with the same resolution
	const existingInflight = inflight.get(urlNoExpiry)
	if (existingInflight) {
		return existingInflight
	}

	// Has this file already been uploaded in the past? Grab the existing copy from the database.
	const existingFromDb = select("file", "mxc_url", {discord_url: urlNoExpiry}).pluck().get()
	if (typeof existingFromDb === "string") {
		return existingFromDb
	}

	// Download from Discord
	const promise = fetch(url, {}).then(async res => {
		// Upload to Matrix
		const root = await module.exports._actuallyUploadDiscordFileToMxc(urlNoExpiry, res)

		// Store relationship in database
		db.prepare("INSERT INTO file (discord_url, mxc_url) VALUES (?, ?)").run(urlNoExpiry, root.content_uri)
		inflight.delete(urlNoExpiry)

		return root.content_uri
	})
	inflight.set(urlNoExpiry, promise)

	return promise
}

/**
 * @param {string} url
 * @param {Response} res
 */
async function _actuallyUploadDiscordFileToMxc(url, res) {
	const body = res.body
	/** @type {import("../types").R.FileUploaded} */
	const root = await mreq.mreq("POST", "/media/v3/upload", body, {
		headers: {
			"Content-Type": res.headers.get("content-type")
		}
	})
	return root
}

function guildIcon(guild) {
	return `/icons/${guild.id}/${guild.icon}.png?size=${IMAGE_SIZE}`
}

function userAvatar(user) {
	return `/avatars/${user.id}/${user.avatar}.png?size=${IMAGE_SIZE}`
}

function memberAvatar(guildID, user, member) {
	if (!member.avatar) return userAvatar(user)
	return `/guilds/${guildID}/users/${user.id}/avatars/${member.avatar}.png?size=${IMAGE_SIZE}`
}

function emoji(emojiID, animated) {
	const base = `/emojis/${emojiID}`
	if (animated) return base + ".gif"
	else return base + ".png"
}

const stickerFormat = new Map([
	[1, {label: "PNG", ext: "png", mime: "image/png"}],
	[2, {label: "APNG", ext: "png", mime: "image/apng"}],
	[3, {label: "LOTTIE", ext: "json", mime: "lottie"}],
	[4, {label: "GIF", ext: "gif", mime: "image/gif"}]
])

/** @param {{id: string, format_type: number}} sticker */
function sticker(sticker) {
	const format = stickerFormat.get(sticker.format_type)
	if (!format) throw new Error(`No such format ${sticker.format_type} for sticker ${JSON.stringify(sticker)}`)
	const ext = format.ext
	return `/stickers/${sticker.id}.${ext}`
}

module.exports.DISCORD_IMAGES_BASE = DISCORD_IMAGES_BASE
module.exports.guildIcon = guildIcon
module.exports.userAvatar = userAvatar
module.exports.memberAvatar = memberAvatar
module.exports.emoji = emoji
module.exports.stickerFormat = stickerFormat
module.exports.sticker = sticker
module.exports.uploadDiscordFileToMxc = uploadDiscordFileToMxc
module.exports._actuallyUploadDiscordFileToMxc = _actuallyUploadDiscordFileToMxc
module.exports._removeExpiryParams = _removeExpiryParams
