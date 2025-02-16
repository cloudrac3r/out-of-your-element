// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const Ty = require("../../types")
const assert = require("assert").strict

const passthrough = require("../../passthrough")
const {sync, db, select} = passthrough
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")
/** @type {import("../../matrix/mreq")} */
const mreq = sync.require("../../matrix/mreq")
/** @type {import("../converters/lottie")} */
const convertLottie = sync.require("../converters/lottie")

const INFO = {
	mimetype: "image/png",
	w: convertLottie.SIZE,
	h: convertLottie.SIZE
}

/**
 * @param {DiscordTypes.APIStickerItem} stickerItem
 * @returns {Promise<{mxc_url: string, info: typeof INFO}>}
 */
async function convert(stickerItem) {
	// Reuse sticker if already converted and uploaded
	const existingMxc = select("lottie", "mxc_url", {sticker_id: stickerItem.id}).pluck().get()
	if (existingMxc) return {mxc_url: existingMxc, info: INFO}

	// Fetch sticker data from Discord
	const res = await fetch(file.DISCORD_IMAGES_BASE + file.sticker(stickerItem))
	if (res.status !== 200) throw new Error("Sticker data file not found.")
	const text = await res.text()

	// Convert to PNG (stream.Readable)
	const readablePng = await convertLottie.convert(text)

	// Upload to MXC
	/** @type {Ty.R.FileUploaded} */
	const root = await mreq.mreq("POST", "/media/v3/upload", readablePng, {
		headers: {
			"Content-Type": INFO.mimetype
		}
	})
	assert(root.content_uri)

	// Save the link for next time
	db.prepare("INSERT INTO lottie (sticker_id, mxc_url) VALUES (?, ?)").run(stickerItem.id, root.content_uri)
	return {mxc_url: root.content_uri, info: INFO}
}

module.exports.convert = convert
