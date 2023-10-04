// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const Ty = require("../../types")
const assert = require("assert").strict
const {PNG} = require("pngjs")

const passthrough = require("../../passthrough")
const {sync, db, discord, select} = passthrough
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")
//** @type {import("../../matrix/mreq")} */
const mreq = sync.require("../../matrix/mreq")

const SIZE = 160 // Discord's display size on 1x displays is 160

const INFO = {
	mimetype: "image/png",
	w: SIZE,
	h: SIZE
}

/**
 * @typedef RlottieWasm
 * @prop {(string) => boolean} load load lottie data from string of json
 * @prop {() => number} frames get number of frames
 * @prop {(frameCount: number, width: number, height: number) => Uint8Array} render render lottie data to bitmap
 */

const Rlottie = (async () => {
	const Rlottie = require("./rlottie-wasm.js")
	await new Promise(resolve => Rlottie.onRuntimeInitialized = resolve)
	return Rlottie
})()

/**
 * @param {DiscordTypes.APIStickerItem} stickerItem
 * @returns {Promise<{mxc_url: string, info: typeof INFO}>}
 */
async function convert(stickerItem) {
	const existingMxc = select("lottie", "mxc_url", "WHERE sticker_id = ?").pluck().get(stickerItem.id)
	if (existingMxc) return {mxc_url: existingMxc, info: INFO}
	const r = await Rlottie
	const res = await fetch(file.DISCORD_IMAGES_BASE + file.sticker(stickerItem))
	if (res.status !== 200) throw new Error("Sticker data file not found.")
	const text = await res.text()
	/** @type RlottieWasm */
	const rh = new r.RlottieWasm()
	const status = rh.load(text)
	if (!status) throw new Error(`Rlottie unable to load ${text.length} byte data file.`)
	const rendered = rh.render(0, SIZE, SIZE)
	let png = new PNG({
		width: SIZE,
		height: SIZE,
		bitDepth: 8, // 8 red + 8 green + 8 blue + 8 alpha
		colorType: 6, // RGBA
		inputColorType: 6, // RGBA
		inputHasAlpha: true,
	})
	png.data = Buffer.from(rendered)
	// @ts-ignore wrong type from pngjs
	const readablePng = png.pack()
	/** @type {Ty.R.FileUploaded} */
	const root = await mreq.mreq("POST", "/media/v3/upload", readablePng, {
		headers: {
			"Content-Type": INFO.mimetype
		}
	})
	assert(root.content_uri)
	db.prepare("INSERT INTO lottie (sticker_id, mxc_url) VALUES (?, ?)").run(stickerItem.id, root.content_uri)
	return {mxc_url: root.content_uri, info: INFO}
}

module.exports.convert = convert
