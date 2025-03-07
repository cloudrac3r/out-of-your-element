// @ts-check

const passthrough = require("../passthrough")
const {reg, writeRegistration} = require("./read-registration.js")
const Ty = require("../types")

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

	// Download from Discord and upload to Matrix
	const promise = module.exports._actuallyUploadDiscordFileToMxc(url).then(root => {
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
 * @returns {Promise<Ty.R.FileUploaded>}
 */
async function _actuallyUploadDiscordFileToMxc(url) {
	const res = await fetch(url, {})
	try {
		/** @type {Ty.R.FileUploaded} */
		const root = await mreq.mreq("POST", "/media/v3/upload", res.body, {
			headers: {
				"Content-Type": res.headers.get("content-type")
			}
		})
		return root
	} catch (e) {
		if (e instanceof mreq.MatrixServerError && e.data.error?.includes("Content-Length") && !reg.ooye.content_length_workaround) {
			reg.ooye.content_length_workaround = true
			const root = await _actuallyUploadDiscordFileToMxc(url)
			console.error("OOYE cannot stream uploads to Synapse. The `content_length_workaround` option"
				+ "\nhas been activated in registration.yaml, which works around the problem, but"
				+ "\nhalves the speed of bridging d->m files. A better way to resolve this problem"
				+ "\nis to run an nginx reverse proxy to Synapse and re-run OOYE setup.")
			writeRegistration(reg)
			return root
		}
		throw e
	}
}

function guildIcon(guild) {
	return `/icons/${guild.id}/${guild.icon}.png?size=${IMAGE_SIZE}`
}

function userAvatar(user) {
	return `/avatars/${user.id}/${user.avatar}.png?size=${IMAGE_SIZE}`
}

function memberAvatar(guildID, user, member) {
	if (!member?.avatar) return userAvatar(user)
	return `/guilds/${guildID}/users/${user.id}/avatars/${member?.avatar}.png?size=${IMAGE_SIZE}`
}

function emoji(emojiID, animated) {
	const base = `/emojis/${emojiID}`
	if (animated) return base + ".gif"
	else return base + ".png"
}

const stickerFormat = new Map([
	[1, {label: "PNG", ext: "png", mime: "image/png", endpoint: "/stickers/"}],
	[2, {label: "APNG", ext: "png", mime: "image/apng", endpoint: "/stickers/"}],
	[3, {label: "LOTTIE", ext: "json", mime: "lottie", endpoint: "/stickers/"}],
	[4, {label: "GIF", ext: "gif", mime: "image/gif", endpoint: "https://media.discordapp.net/stickers/"}]
])

/** @param {{id: string, format_type: number}} sticker */
function sticker(sticker) {
	const format = stickerFormat.get(sticker.format_type)
	if (!format) throw new Error(`No such format ${sticker.format_type} for sticker ${JSON.stringify(sticker)}`)
	return `${format.endpoint}${sticker.id}.${format.ext}`
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
