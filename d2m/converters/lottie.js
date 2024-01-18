// @ts-check

const stream = require("stream")
const {PNG} = require("pngjs")

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
 * @returns {Promise<import("stream").Readable>}
 */
async function convert(text) {
	const r = await Rlottie
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
	// The transform stream is necessary because PNG requires me to pipe it somewhere before this event loop ends
	const resultStream = png.pack()
	const p = new stream.PassThrough()
	resultStream.pipe(p)
	return p
}

module.exports.convert = convert
module.exports.SIZE = SIZE
