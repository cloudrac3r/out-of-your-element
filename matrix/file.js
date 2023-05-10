// @ts-check

const fetch = require("node-fetch").default

const passthrough = require("../passthrough")
const { sync, db } = passthrough
/** @type {import("./mreq")} */
const mreq = sync.require("./mreq")

const DISCORD_IMAGES_BASE = "https://cdn.discordapp.com"
const IMAGE_SIZE = 1024

/** @type {Map<string, Promise<string>>} */
const inflight = new Map()

/**
 * @param {string} path
 */
async function uploadDiscordFileToMxc(path) {
	let url
	if (path.startsWith("http")) {
		// TODO: this is cheating to make seed.js easier. due a refactor or a name change since it's not soley for discord?
		// possibly could be good to save non-discord external URLs under a user-specified key rather than simply using the url?
		url = path
	} else {
		url = DISCORD_IMAGES_BASE + path
	}

	// Are we uploading this file RIGHT NOW? Return the same inflight promise with the same resolution
	let existing = inflight.get(url)
	if (typeof existing === "string") {
		return existing
	}

	// Has this file already been uploaded in the past? Grab the existing copy from the database.
	existing = db.prepare("SELECT mxc_url FROM file WHERE discord_url = ?").pluck().get(url)
	if (typeof existing === "string") {
		return existing
	}

	// Download from Discord
	const promise = fetch(url, {}).then(/** @param {import("node-fetch").Response} res */ async res => {
		const body = res.body

		// Upload to Matrix
		/** @type {import("../types").R.FileUploaded} */
		const root = await mreq.mreq("POST", "/media/v3/upload", body, {
			headers: {
				"Content-Type": res.headers.get("content-type")
			}
		})

		// Store relationship in database
		db.prepare("INSERT INTO file (discord_url, mxc_url) VALUES (?, ?)").run(url, root.content_uri)
		inflight.delete(url)

		return root.content_uri
	})
	inflight.set(url, promise)

	return promise
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

module.exports.guildIcon = guildIcon
module.exports.userAvatar = userAvatar
module.exports.memberAvatar = memberAvatar
module.exports.uploadDiscordFileToMxc = uploadDiscordFileToMxc
