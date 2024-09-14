// @ts-check

const assert = require("assert/strict")
const {defineEventHandler, getValidatedRouterParams, sendRedirect, createError} = require("h3")
const {z} = require("zod")

const {discord, as, select} = require("../../passthrough")

const schema = {
	params: z.object({
		channel_id: z.string().regex(/^[0-9]+$/),
		attachment_id: z.string().regex(/^[0-9]+$/),
		file_name: z.string().regex(/^[-A-Za-z0-9_.,]+$/)
	})
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

as.router.get(`/download/discordcdn/:channel_id/:attachment_id/:file_name`, defineEventHandler(async event => {
	const params = await getValidatedRouterParams(event, schema.params.parse)

	const row = select("channel_room", "channel_id", {channel_id: params.channel_id}).get()
	if (row == null) {
		throw createError({
			status: 403,
			data: `The file you requested isn't permitted by this media proxy.`
		})
	}

	const url = `https://cdn.discordapp.com/attachments/${params.channel_id}/${params.attachment_id}/${params.file_name}`
	let promise = cache.get(url)
	/** @type {string | undefined} */
	let refreshed
	if (promise) {
		refreshed = await promise
		if (!timeUntilExpiry(refreshed)) promise = undefined
	}
	if (!promise) {
		promise = discord.snow.channel.refreshAttachmentURLs([url]).then(x => x.refreshed_urls[0].refreshed)
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
}))
