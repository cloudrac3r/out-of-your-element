// @ts-check

const stream = require("stream")
const {sync} = require("../../passthrough")

/** @type {import("../converters/emoji-sheet")} */
const emojiSheetConverter = sync.require("../converters/emoji-sheet")
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")

/**
 * Downloads the emoji from the web and converts to uncompressed PNG data.
 * @param {string} mxc a single mxc:// URL
 * @returns {Promise<Buffer | undefined>} uncompressed PNG data, or undefined if the downloaded emoji is not valid
 */
async function getAndConvertEmoji(mxc) {
	const abortController = new AbortController()
	// If it turns out to be a GIF, we want to abandon the connection without downloading the whole thing.
	// If we were using connection pooling, we would be forced to download the entire GIF.
	// So we set no agent to ensure we are not connection pooling.
	const res = await api.getMedia(mxc, {signal: abortController.signal})
	const readable = stream.Readable.fromWeb(res.body)
	return emojiSheetConverter.convertImageStream(readable, () => {
		abortController.abort()
		readable.emit("end")
		readable.on("error", () => {}) // DOMException [AbortError]: This operation was aborted
	})
}

module.exports.getAndConvertEmoji = getAndConvertEmoji
