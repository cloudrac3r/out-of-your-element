// @ts-check

const assert = require("assert").strict
const stream = require("stream")
const {pipeline} = require("stream").promises
const sharp = require("sharp")
const {GIFrame} = require("@cloudrac3r/giframe")
const {PNG} = require("@cloudrac3r/pngjs")
const streamMimeType = require("stream-mime-type")

const SIZE = 48
const RESULT_WIDTH = 400
const IMAGES_ACROSS = Math.floor(RESULT_WIDTH / SIZE)

/**
 * Composite a bunch of Matrix emojis into a kind of spritesheet image to upload to Discord.
 * @param {string[]} mxcs mxc URLs, in order
 * @param {(mxc: string) => Promise<Buffer | undefined>} mxcDownloader function that will download the mxc URLs and convert to uncompressed PNG data. use `getAndConvertEmoji` or a mock.
 * @returns {Promise<Buffer>} PNG image
 */
async function compositeMatrixEmojis(mxcs, mxcDownloader) {
	const buffers = await Promise.all(mxcs.map(mxcDownloader))

	// Calculate the size of the final composited image
	const totalWidth = Math.min(buffers.length, IMAGES_ACROSS) * SIZE
	const imagesDown = Math.ceil(buffers.length / IMAGES_ACROSS)
	const totalHeight = imagesDown * SIZE
	const comp = []
	let left = 0, top = 0
	for (const buffer of buffers) {
		if (Buffer.isBuffer(buffer)) {
			// Composite the current buffer into the sprite sheet
			comp.push({left, top, input: buffer})
			// The next buffer should be placed one slot to the right
			left += SIZE
			// If we're out of space to fit the entire next buffer there, wrap to the next line
			if (left + SIZE > RESULT_WIDTH) {
				left = 0
				top += SIZE
			}
		}
	}

	const output = await sharp({create: {width: totalWidth, height: totalHeight, channels: 4, background: {r: 0, g: 0, b: 0, alpha: 0}}})
		.composite(comp)
		.png()
		.toBuffer({resolveWithObject: true})
	return output.data
}

/**
 * @param {stream.Readable} streamIn
 * @param {() => any} stopStream
 * @returns {Promise<Buffer | undefined>} Uncompressed PNG image
 */
async function convertImageStream(streamIn, stopStream) {
	const {stream, mime} = await streamMimeType.getMimeType(streamIn)
	assert(["image/png", "image/jpeg", "image/webp", "image/gif", "image/apng"].includes(mime), `Mime type ${mime} is impossible for emojis`)

	try {
		if (mime === "image/png" || mime === "image/jpeg" || mime === "image/webp") {
			/** @type {{info: sharp.OutputInfo, buffer: Buffer}} */
			const result = await new Promise((resolve, reject) => {
				const transformer = sharp()
					.resize(SIZE, SIZE, {fit: "contain", background: {r: 0, g: 0, b: 0, alpha: 0}})
					.png({compressionLevel: 0})
					.toBuffer((err, buffer, info) => {
						/* c8 ignore next */
						if (err) return reject(err)
						resolve({info, buffer})
					})
				pipeline(
					stream,
					transformer
				)
			})
			return result.buffer

		} else if (mime === "image/gif") {
			const giframe = new GIFrame(0)
			stream.on("data", chunk => {
				giframe.feed(chunk)
			})
			const frame = await giframe.getFrame()
			const pixels = Uint8Array.from(frame.pixels)
			stopStream()

			const buffer = await sharp(pixels, {raw: {width: frame.width, height: frame.height, channels: 4}})
				.resize(SIZE, SIZE, {fit: "contain", background: {r: 0, g: 0, b: 0, alpha: 0}})
				.png({compressionLevel: 0})
				.toBuffer({resolveWithObject: true})
			return buffer.data

		} else if (mime === "image/apng") {
			const png = new PNG({maxFrames: 1})
			// @ts-ignore
			stream.pipe(png)
			/** @type {Buffer} */ // @ts-ignore
			const frame = await new Promise(resolve => png.on("parsed", resolve))
			stopStream()

			const buffer = await sharp(frame, {raw: {width: png.width, height: png.height, channels: 4}})
				.resize(SIZE, SIZE, {fit: "contain", background: {r: 0, g: 0, b: 0, alpha: 0}})
				.png({compressionLevel: 0})
				.toBuffer({resolveWithObject: true})
			return buffer.data

		}
	} finally {
		stopStream()
	}
}

module.exports.compositeMatrixEmojis = compositeMatrixEmojis
module.exports.convertImageStream = convertImageStream
