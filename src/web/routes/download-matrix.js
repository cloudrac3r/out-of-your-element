// @ts-check

const assert = require("assert/strict")
const {defineEventHandler, getValidatedRouterParams, setResponseStatus, setResponseHeader, createError, H3Event, getValidatedQuery} = require("h3")
const {z} = require("zod")

/** @type {import("xxhash-wasm").XXHashAPI} */ // @ts-ignore
let hasher = null
// @ts-ignore
require("xxhash-wasm")().then(h => hasher = h)

const {sync, as, select} = require("../../passthrough")

/** @type {import("../../m2d/actions/emoji-sheet")} */
const emojiSheet = sync.require("../../m2d/actions/emoji-sheet")
/** @type {import("../../m2d/converters/emoji-sheet")} */
const emojiSheetConverter = sync.require("../../m2d/converters/emoji-sheet")

const schema = {
	params: z.object({
		server_name: z.string(),
		media_id: z.string()
	}),
	sheet: z.object({
		e: z.array(z.string()).or(z.string())
	})
}

/**
 * @param {H3Event} event
 * @returns {import("../../matrix/api")}
 */
function getAPI(event) {
	/* c8 ignore next */
	return event.context.api || sync.require("../../matrix/api")
}

/**
 * @param {H3Event} event
 * @returns {typeof emojiSheet["getAndConvertEmoji"]}
 */
function getMxcDownloader(event) {
	/* c8 ignore next */
	return event.context.mxcDownloader || emojiSheet.getAndConvertEmoji
}

function verifyMediaHash(serverAndMediaID) {
	const unsignedHash = hasher.h64(serverAndMediaID)
	const signedHash = unsignedHash - 0x8000000000000000n // shifting down to signed 64-bit range

	const row = select("media_proxy", "permitted_hash", {permitted_hash: signedHash}).get()
	if (row == null) {
		throw createError({
			status: 403,
			data: `The file you requested isn't permitted by this media proxy.`
		})
	}
}

as.router.get(`/download/matrix/:server_name/:media_id`, defineEventHandler(async event => {
	const params = await getValidatedRouterParams(event, schema.params.parse)

	verifyMediaHash(`${params.server_name}/${params.media_id}`)
	const api = getAPI(event)
	const res = await api.getMedia(`mxc://${params.server_name}/${params.media_id}`)

	const contentType = res.headers.get("content-type")
	assert(contentType)

	setResponseStatus(event, res.status)
	setResponseHeader(event, "Content-Type", contentType)
	setResponseHeader(event, "Transfer-Encoding", "chunked")
	return res.body
}))

as.router.get(`/download/sheet`, defineEventHandler(async event => {
	const query = await getValidatedQuery(event, schema.sheet.parse)

	/** remember that these have no mxc:// protocol in the string for space reasons */
	let mxcs = query.e
	if (!Array.isArray(mxcs)) {
		mxcs = [mxcs]
	}

	for (const serverAndMediaID of mxcs) {
		verifyMediaHash(serverAndMediaID)
	}

	const buffer = await emojiSheetConverter.compositeMatrixEmojis(mxcs.map(s => `mxc://${s}`), getMxcDownloader(event))
	setResponseHeader(event, "Content-Type", "image/png")
	return buffer
}))
