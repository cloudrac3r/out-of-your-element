// @ts-check

const fetch = require("node-fetch")

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
	const url = DISCORD_IMAGES_BASE + path

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
		/** @ts-ignore @type {import("stream").Readable} body */
		const body = res.body

		// Upload to Matrix
		/** @type {import("../types").R_FileUploaded} */
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
	return `/icons/${guild.id}/${guild.icon}?size=${IMAGE_SIZE}`
}

module.exports.guildIcon = guildIcon
module.exports.uploadDiscordFileToMxc = uploadDiscordFileToMxc
