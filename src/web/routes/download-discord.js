// @ts-check

const assert = require("assert/strict")
const {defineEventHandler, getValidatedRouterParams, sendRedirect, createError, H3Event} = require("h3")
const {z} = require("zod")

/** @type {import("xxhash-wasm").XXHashAPI} */ // @ts-ignore
let hasher = null
// @ts-ignore
require("xxhash-wasm")().then(h => hasher = h)

const {discord, as, select} = require("../../passthrough")

const schema = {
	params: z.object({
		channel_id: z.string().regex(/^[0-9]+$/),
		attachment_id: z.string().regex(/^[0-9]+$/),
		file_name: z.string().regex(/^[-A-Za-z0-9_.,]+$/)
	})
}

/**
 * @param {H3Event} event
 * @returns {import("snowtransfer").SnowTransfer}
 */
function getSnow(event) {
	/* c8 ignore next */
	return event.context.snow || discord.snow
}

/** @type {Map<string, Promise<string>>} */
const cache = new Map()

/** @param {string} url */
function timeUntilExpiry(url) {
	const params = new URL(url).searchParams
	const ex = params.get("ex")
	assert(ex) // refreshed urls from the discord api always include this parameter
	const time = parseInt(ex, 16)*1000 - Date.now()
	if (time > 0) return time
	return false
}

function defineMediaProxyHandler(domain) {
	return defineEventHandler(async event => {
		const params = await getValidatedRouterParams(event, schema.params.parse)

		const unsignedHash = hasher.h64(params.attachment_id)
		const signedHash = unsignedHash - 0x8000000000000000n // shifting down to signed 64-bit range

		const row = select("media_proxy", "permitted_hash", {permitted_hash: signedHash}).get()
		if (row == null) {
			throw createError({
				status: 403,
				data: `The file you requested isn't permitted by this media proxy.`
			})
		}

		const url = `https://${domain}/attachments/${params.channel_id}/${params.attachment_id}/${params.file_name}`
		let promise = cache.get(url)
		/** @type {string | undefined} */
		let refreshed
		if (promise) {
			refreshed = await promise
			if (!timeUntilExpiry(refreshed)) promise = undefined
		}
		if (!promise) {
			const snow = getSnow(event)
			promise = snow.channel.refreshAttachmentURLs([url]).then(x => x.refreshed_urls[0].refreshed)
			cache.set(url, promise)
			refreshed = await promise
			const time = timeUntilExpiry(refreshed)
			assert(time) // the just-refreshed URL will always be in the future
			setTimeout(() => {
				cache.delete(url)
			}, time).unref()
		}
		assert(refreshed) // will have been assigned by one of the above branches

		return sendRedirect(event, refreshed)
	})
}

as.router.get(`/download/discordcdn/:channel_id/:attachment_id/:file_name`, defineMediaProxyHandler("cdn.discordapp.com"))
as.router.get(`/download/discordmedia/:channel_id/:attachment_id/:file_name`, defineMediaProxyHandler("media.discordapp.net"))
