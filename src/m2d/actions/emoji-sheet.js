// @ts-check

const assert = require("assert")
const fetch = require("node-fetch").default

const utils = require("../converters/utils")
const {sync} = require("../../passthrough")

/** @type {import("../converters/emoji-sheet")} */
const emojiSheetConverter = sync.require("../converters/emoji-sheet")

/**
 * Downloads the emoji from the web and converts to uncompressed PNG data.
 * @param {string} mxc a single mxc:// URL
 * @returns {Promise<Buffer | undefined>} uncompressed PNG data, or undefined if the downloaded emoji is not valid
 */
async function getAndConvertEmoji(mxc) {
	const abortController = new AbortController()

	const url = utils.getPublicUrlForMxc(mxc)
	assert(url)

	/** @type {import("node-fetch").Response} */
	// If it turns out to be a GIF, we want to abandon the connection without downloading the whole thing.
	// If we were using connection pooling, we would be forced to download the entire GIF.
	// So we set no agent to ensure we are not connection pooling.
	// @ts-ignore the signal is slightly different from the type it wants (still works fine)
	const res = await fetch(url, {agent: false, signal: abortController.signal})
	return emojiSheetConverter.convertImageStream(res.body, () => {
		abortController.abort()
		res.body.pause()
		res.body.emit("end")
	})
}

module.exports.getAndConvertEmoji = getAndConvertEmoji
