// @ts-check

const {defineEventHandler, getValidatedRouterParams, setResponseStatus, setResponseHeader, sendStream, createError} = require("h3")
const {z} = require("zod")
const fetch = require("node-fetch")

/** @type {import("xxhash-wasm").XXHashAPI} */ // @ts-ignore
let hasher = null
// @ts-ignore
require("xxhash-wasm")().then(h => hasher = h)

const {reg} = require("../../matrix/read-registration")
const {as, select} = require("../../passthrough")

const schema = {
	params: z.object({
		server_name: z.string(),
		media_id: z.string()
	})
}

as.router.get(`/download/matrix/:server_name/:media_id`, defineEventHandler(async event => {
	const params = await getValidatedRouterParams(event, schema.params.parse)

	const serverAndMediaID = `${params.server_name}/${params.media_id}`
	const unsignedHash = hasher.h64(serverAndMediaID)
	const signedHash = unsignedHash - 0x8000000000000000n // shifting down to signed 64-bit range

	const row = select("media_proxy", "permitted_hash", {permitted_hash: signedHash}).get()
	if (row == null) {
		throw createError({
			status: 403,
			data: `The file you requested isn't permitted by this media proxy.`
		})
	}

	const res = await fetch(`${reg.ooye.server_origin}/_matrix/client/v1/media/download/${params.server_name}/${params.media_id}`, {
		headers: {
			Authorization: `Bearer ${reg.as_token}`
		}
	})

	setResponseStatus(event, res.status)
	setResponseHeader(event, "Content-Type", res.headers.get("content-type"))
	setResponseHeader(event, "Transfer-Encoding", "chunked")

	return sendStream(event, res.body)
}))
