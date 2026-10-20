// @ts-check

const {Transform} = require("stream")
const {ReadableStream} = require("stream/web")

const {sync} = require("../../passthrough")
const sharp = require("sharp")
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("../../matrix/mreq")} */
const mreq = sync.require("../../matrix/mreq")

const WIDTH = 160
const HEIGHT = 160
/**
 * Downloads the sticker from the web and converts to webp data.
 * @param {string} mxc a single mxc:// URL
 * @returns {Promise<ReadableStream>} sticker webp data, or undefined if the downloaded sticker is not valid
 */
async function getAndResizeSticker(mxc) {
	const res = await api.getMedia(mxc)

	return res.body.pipeThrough(
		Transform.toWeb(
			sharp({animated: true})
				.resize(WIDTH, HEIGHT, {fit: "inside", background: {r: 0, g: 0, b: 0, alpha: 0}})
				.webp()
		)
	)
}


module.exports.getAndResizeSticker = getAndResizeSticker
