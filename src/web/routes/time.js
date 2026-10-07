// @ts-check

const {defineEventHandler, getValidatedRouterParams, H3Event, setResponseHeader} = require("h3")
const {as, db, sync} = require("../../passthrough")
const {z} = require("zod")

/** @type {import("../pug-sync")} */
const pugSync = sync.require("../pug-sync")
/** @type {import("../../discord/time")} */
const discordTime = sync.require("../../discord/time")

const schema = {
	time: z.object({
		timestamp: z.coerce.number(),
		style: z.string().optional()
	})
}

as.router.get("/time/:timestamp", defineEventHandler(async event => {
	const {timestamp} = await getValidatedRouterParams(event, schema.time.parse)
	const formatOptions = discordTime.getFormatOptions()
	const text = discordTime.convertDiscordTime(timestamp)
	return pugSync.render(event, "time.pug", {text, timestamp, formatOptions})
}))

as.router.get("/time/:timestamp/:style", defineEventHandler(async event => {
	const {timestamp, style} = await getValidatedRouterParams(event, schema.time.parse)
	const formatOptions = discordTime.getFormatOptions(style)
	const text = discordTime.convertDiscordTime(timestamp, style)
	return pugSync.render(event, "time.pug", {text, timestamp, style, formatOptions})
}))
