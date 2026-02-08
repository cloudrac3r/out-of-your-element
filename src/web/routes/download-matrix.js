// @ts-check

const assert = require("assert/strict")
const {defineEventHandler, getValidatedRouterParams, setResponseStatus, setResponseHeader, createError, H3Event, getValidatedQuery} = require("h3")
const {z} = require("zod")

/** @type {import("xxhash-wasm").XXHashAPI} */ // @ts-ignore
let hasher = null
// @ts-ignore
require("xxhash-wasm")().then(h => hasher = h)

const {sync, as, select} = require("../../passthrough")

const schema = {
	params: z.object({
		server_name: z.string(),
		media_id: z.string()
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

function verifyMediaHash(serverName, mediaId) {
	const serverAndMediaID = `${serverName}/${mediaId}`
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

	verifyMediaHash(params.server_name, params.media_id)
	const api = getAPI(event)
	const res = await api.getMedia(`mxc://${params.server_name}/${params.media_id}`)

	const contentType = res.headers.get("content-type")
	assert(contentType)

	setResponseStatus(event, res.status)
	setResponseHeader(event, "Content-Type", contentType)
	setResponseHeader(event, "Transfer-Encoding", "chunked")
	return res.body
}))

const emojiSchema = z.object({
	'e': z.array(z.string()).or(z.string())
})

const emojiSheet = sync.require("../../m2d/actions/emoji-sheet")
const emojiSheetConverter = sync.require("../../m2d/converters/emoji-sheet")

as.router.get(`/emoji/matrix`, defineEventHandler(async event => {

	const query = await getValidatedQuery(event, emojiSchema.parse)

	let mxcs = query.e
	if(!Array.isArray(mxcs)) {
		mxcs = [mxcs]
	}

	for(let mxc of mxcs) {
		const mediaParts = mxc.match(/^mxc:\/\/([^/]+)\/(\w+)$/)
		if (!mediaParts) return undefined
		verifyMediaHash(mediaParts[1], mediaParts[2])
	}
	const buffer = await emojiSheetConverter.compositeMatrixEmojis(mxcs, emojiSheet.getAndConvertEmoji)

	const contentType = 'image/png'

	setResponseStatus(event, 200)
	setResponseHeader(event, "Content-Type", contentType)
	setResponseHeader(event, "Transfer-Encoding", "chunked")
	return buffer
}))
