// @ts-check

const {Readable} = require("stream")
const {ReadableStream} = require("stream/web")

const {sync} = require("../../passthrough")
const sharp = require("sharp")
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("../../matrix/mreq")} */
const mreq = sync.require("../../matrix/mreq")
const {streamType} = require("@cloudrac3r/stream-type")

const WIDTH = 160
const HEIGHT = 160
/**
 * Downloads the sticker from the web and converts to webp data.
 * @param {string} mxc a single mxc:// URL
 * @returns {Promise<ReadableStream>} sticker webp data, or undefined if the downloaded sticker is not valid
 */
async function getAndResizeSticker(mxc) {
	const res = await api.getMedia(mxc)
	if (res.status !== 200) {
		const root = await res.json()
		throw new mreq.MatrixServerError(root, {mxc})
	}

	const streamIn = Readable.fromWeb(res.body)
	const {streamThrough, type} = await streamType(streamIn)
	const animated = ["image/gif", "image/webp"].includes(type)

	const transformer = sharp({animated: animated})
		.resize(WIDTH, HEIGHT, {fit: "inside", background: {r: 0, g: 0, b: 0, alpha: 0}})
		.webp()
	streamThrough.pipe(transformer)
	return Readable.toWeb(transformer)
}


module.exports.getAndResizeSticker = getAndResizeSticker
