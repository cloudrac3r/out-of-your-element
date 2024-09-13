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

function hasExpired(url) {
	const params = new URL(url).searchParams
	const ex = params.get("ex")
	assert(ex) // refreshed urls from the discord api always include this parameter
	return parseInt(ex, 16) < Date.now() / 1000
}

// purge expired urls from cache every hour
setInterval(() => {
	for (const entry of cache.entries()) {
		if (hasExpired(entry[1])) cache.delete(entry[0])
	}
	console.log(`purged discord media cache, it now has ${cache.size} urls`)
}, 60 * 60 * 1000).unref()

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
	let refreshed
	if (promise) {
		console.log("using existing cache entry")
		refreshed = await promise
		if (hasExpired(refreshed)) promise = undefined
		console.log(promise)
	}
	if (!promise) {
		console.log("refreshing and storing")
		promise = discord.snow.channel.refreshAttachmentURLs([url]).then(x => x.refreshed_urls[0].refreshed)
		cache.set(url, promise)
		refreshed = await promise
	}
	assert(refreshed) // will have been assigned by one of the above branches

	return sendRedirect(event, refreshed)
}))
