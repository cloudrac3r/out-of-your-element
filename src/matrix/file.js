// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const passthrough = require("../passthrough")
const {reg, writeRegistration} = require("./read-registration.js")
const Ty = require("../types")

const {sync, db, select} = passthrough
/** @type {import("./mreq")} */
const mreq = sync.require("./mreq")
/** @type {import("./api")} */
const api = sync.require("./api")

const DISCORD_IMAGES_BASE = "https://cdn.discordapp.com"
const IMAGE_SIZE = 1024

const PREAPPROVED_ORIGINS = new Set([
	"https://avatars.akamai.steamstatic.com",
	"https://avatars.githubusercontent.com",
	"https://cadence.moe",
	"https://cdn.discordapp.com",
	"https://cdn.modrinth.com",
	"https://cdn.pluralkit.me",
	"https://cdn.tupperbox.app",
	"https://codeberg.org",
	"https://files.catbox.moe",
	"https://i.imgur.com",
	"https://media.discordapp.net",
	"https://media.forgecdn.net",
	"https://pbs.twimg.com",
	"https://upload.wikimedia.org",
])

/** @type {Map<string, Promise<string>>} */
const inflight = sync.remember(() => new Map())

/**
 * @param {string} urlString
 */
function _removeExpiryParams(urlString) {
	const url = new URL(urlString)
	url.searchParams.delete("ex")
	url.searchParams.delete("is")
	url.searchParams.delete("sg")
	url.searchParams.delete("hm")
	return url.toString()
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
	function throwDownloadError(message) {
		const e = new Error(message)
		e["downloadURL"] = url
		throw e
	}

	// Download file (with body stream)

	const u = new URL(url)
	if (PREAPPROVED_ORIGINS.has(u.origin) || u.host.endsWith(".discordapp.net")) {
		// Request the file directly, we trust these domains to not point at SSRF
		var res = await fetch(url, {})
		if (!res.ok) throwDownloadError(`File download had failure status code ${res.status}`)
	} else {
		// Try to receive unapproved origins via homeserver url preview, since it knows how to deal with SSRF
		const previewed = await api.previewUrlIfEnabled(url)
		if (previewed === false) throwDownloadError(`File download blocked from unapproved host "${u.host}". Enable URL previews on the homeserver to download this safely.`)
		if (!previewed["og:image"]) throwDownloadError(`File download via URL preview expected an image but didn't get one.`)
		// There is an image
		// @ts-ignore
		var res = await api.getMedia(previewed["og:image"])
	}

	// Upload file

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
		e.uploadURL = url
		throw e
	}
}

/**
 * @param {DiscordTypes.APIGuild} guild
 * @returns {string | null}
 */
function guildIcon(guild) {
	if (!guild.icon) return null
	return `/icons/${guild.id}/${guild.icon}.png?size=${IMAGE_SIZE}`
}

/**
 * @param {DiscordTypes.APIUser | Ty.WebhookAuthor} user
 * @returns {string | null}
 */
function userAvatar(user) {
	if (!user.avatar) return null
	return `/avatars/${user.id}/${user.avatar}.png?size=${IMAGE_SIZE}`
}

/**
 * @param {string} guildID
 * @param {DiscordTypes.APIUser} user
 * @param {Omit<DiscordTypes.APIGuildMember, "user"> | undefined} member
 * @returns {string}
 */
function memberAvatar(guildID, user, member) {
	if (!member?.avatar) return userAvatar(user)
	return `/guilds/${guildID}/users/${user.id}/avatars/${member?.avatar}.png?size=${IMAGE_SIZE}`
}

function emoji(emojiID, animated) {
	const base = `/emojis/${emojiID}.webp`
	if (animated) return base + "?animated=true"
	else return base
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
