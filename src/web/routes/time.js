// @ts-check

const {defineEventHandler, getValidatedRouterParams, H3Event, setResponseHeader} = require("h3")
const {as, db, sync} = require("../../passthrough")
const {z} = require("zod")

/** @type {import("../pug-sync")} */
const pugSync = sync.require("../pug-sync")
/** @type {import("../../discord/time")} */
const discordTime = sync.require("../../discord/time")
/** @type {import("../web-utils")} */
const webUtils = sync.require("../web-utils")

const schema = {
	time: z.object({
		timestamp: z.coerce.number(),
		style: z.enum([...discordTime.styles.keys(), "R"]).optional()
	})
}

as.router.get("/time/:timestamp", defineEventHandler(async event => {
	webUtils.rejectUrlPreviewer(event) // url previewers can't show the local time, making it useless. hiding for everyone's sake
	const {timestamp} = await getValidatedRouterParams(event, schema.time.parse)
	const formatOptions = discordTime.getFormatOptions()
	const text = discordTime.convertDiscordTime(timestamp)
	return pugSync.render(event, "time.pug", {text, timestamp, style: discordTime.defaultStyle, formatOptions})
}))

as.router.get("/time/:timestamp/:style", defineEventHandler(async event => {
	webUtils.rejectUrlPreviewer(event)
	const {timestamp, style} = await getValidatedRouterParams(event, schema.time.parse)
	const formatOptions = discordTime.getFormatOptions(style)
	const text = discordTime.convertDiscordTime(timestamp, style)
	return pugSync.render(event, "time.pug", {text, timestamp, style, formatOptions})
}))
