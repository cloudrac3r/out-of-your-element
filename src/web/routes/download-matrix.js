// @ts-check

const assert = require("assert/strict")
const {defineEventHandler, getValidatedRouterParams, setResponseStatus, setResponseHeader, createError, H3Event, getValidatedQuery} = require("h3")
const {z} = require("zod")
const {ReadableStream} = require("stream/web")
const {Readable} = require("stream")
const sharp = require("sharp")

/** @type {import("xxhash-wasm").XXHashAPI} */ // @ts-ignore
let hasher = null
// @ts-ignore
require("xxhash-wasm")().then(h => hasher = h)

const {sync, as, select} = require("../../passthrough")

/** @type {import("../../m2d/actions/emoji-sheet")} */
const emojiSheet = sync.require("../../m2d/actions/emoji-sheet")
/** @type {import("../../m2d/converters/emoji-sheet")} */
const emojiSheetConverter = sync.require("../../m2d/converters/emoji-sheet")

/** @type {import("../../m2d/actions/sticker")} */
const sticker = sync.require("../../m2d/actions/sticker")

// Resizing client-side because server-side is too slow, at least with Synapse. Really need it to be fast because webhook avatars show a placeholder in the interim.
/** @type {{[presetKey: string]: (body: ReadableStream) => ReadableStream}} */
const MEDIA_THUMBNAIL_PRESETS = {
	avatar: body =>
		Readable.toWeb(
			Readable.fromWeb(body).pipe(
				sharp()
				.resize({height: 210, width: 210, fit: "cover"}) // the largest display of the webhook pfp on Discord Android in screen pixels
				.jpeg({force: false, quality: 90}) // File size works out to up to ~110k for a PNG, less for a JPEG
			)
		)
}

const schema = {
	media: z.object({
		server_name: z.string(),
		media_id: z.string()
	}),
	mediaQuery: z.object({
		preset: z.enum(Object.keys(MEDIA_THUMBNAIL_PRESETS)) // list of possible thumbnail presets
	}),
	sheet: z.object({
		e: z.array(z.string()).or(z.string())
	}),
	sticker: z.object({
		server_name: z.string().regex(/^[^/]+$/),
		media_id: z.string().regex(/^[A-Za-z0-9_-]+$/)
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
	const params = await getValidatedRouterParams(event, schema.media.parse)
	const query = await getValidatedQuery(event, schema.mediaQuery.safeParse)

	verifyMediaHash(`${params.server_name}/${params.media_id}`)
	const api = getAPI(event)
	const res = await api.getMedia(`mxc://${params.server_name}/${params.media_id}`)

	const contentType = res.headers.get("content-type")
	assert(contentType)

	setResponseStatus(event, res.status)
	setResponseHeader(event, "Content-Type", contentType)
	setResponseHeader(event, "Transfer-Encoding", "chunked")

	if (res.ok && query.success) {
		return MEDIA_THUMBNAIL_PRESETS[query.data.preset](res.body)
	} else {
		return res.body
	}
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

as.router.get(`/download/sticker/:server_name/:media_id/_.webp`, defineEventHandler(async event => {
	const {server_name, media_id} = await getValidatedRouterParams(event, schema.sticker.parse)
	/** remember that this has no mxc:// protocol in the string */
	const mxc = server_name + "/" + media_id
	verifyMediaHash(mxc)

	const stream = await sticker.getAndResizeSticker(`mxc://${mxc}`)
	setResponseHeader(event, "Content-Type", "image/webp")
	return stream
}))
