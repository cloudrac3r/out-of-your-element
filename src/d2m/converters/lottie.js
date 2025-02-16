// @ts-check

const assert = require("assert")
const stream = require("stream")
const {PNG} = require("@cloudrac3r/pngjs")

const SIZE = 160 // Discord's display size on 1x displays is 160

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
 * @param {string} text
 * @returns {Promise<stream.Readable>}
 */
async function convert(text) {
	const r = await Rlottie
	/** @type RlottieWasm */
	const rh = new r.RlottieWasm()
	const status = rh.load(text)
	assert(status, `Rlottie unable to load ${text.length} byte data file.`)
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
	// png.pack() is a bad stream and will throw away any data it sends if it's not connected to a destination straight away.
	// We use Duplex.from to convert it into a good stream.
	// @ts-ignore
	return stream.Duplex.from(png.pack())
}

module.exports.convert = convert
module.exports.SIZE = SIZE
