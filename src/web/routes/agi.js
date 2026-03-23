// @ts-check

const {z} = require("zod")
const {defineEventHandler, getValidatedQuery, sendRedirect} = require("h3")
const {as, from, sync, db} = require("../../passthrough")

/** @type {import("../pug-sync")} */
const pugSync = sync.require("../pug-sync")

const schema = {
	opt: z.object({
		guild_id: z.string().regex(/^[0-9]+$/)
	})
}

as.router.get("/agi", defineEventHandler(async event => {
	return pugSync.render(event, "agi.pug", {})
}))

as.router.get("/agi/optout", defineEventHandler(async event => {
	return pugSync.render(event, "agi-optout.pug", {})
}))

as.router.post("/agi/optout", defineEventHandler(async event => {
	const parseResult = await getValidatedQuery(event, schema.opt.safeParse)
	if (parseResult.success) {
		db.prepare("INSERT OR IGNORE INTO agi_optout (guild_id) VALUES (?)").run(parseResult.data.guild_id)
	}
	return sendRedirect(event, "", 302)
}))

as.router.post("/agi/optin", defineEventHandler(async event => {
	const {guild_id} = await getValidatedQuery(event, schema.opt.parse)
	db.prepare("DELETE FROM agi_optout WHERE guild_id = ?").run(guild_id)
	return sendRedirect(event, `../agi?guild_id=${guild_id}`, 302)
}))
