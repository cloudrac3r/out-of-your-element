// @ts-check

const {z} = require("zod")
const {defineEventHandler, sendRedirect, useSession, createError, readValidatedBody} = require("h3")

const {as, db} = require("../../passthrough")
const {reg} = require("../../matrix/read-registration")

const schema = {
	autocreate: z.object({
		guild_id: z.string(),
		autocreate: z.string().optional()
	})
}

as.router.post("/api/autocreate", defineEventHandler(async event => {
	const parsedBody = await readValidatedBody(event, schema.autocreate.parse)
	const session = await useSession(event, {password: reg.as_token})
	if (!(session.data.managedGuilds || []).includes(parsedBody.guild_id)) throw createError({status: 403, message: "Forbidden", data: "Can't change settings for a guild you don't have Manage Server permissions in"})

	db.prepare("UPDATE guild_space SET autocreate = ? WHERE guild_id = ?").run(+!!parsedBody.autocreate, parsedBody.guild_id)
	return sendRedirect(event, `/guild?guild_id=${parsedBody.guild_id}`, 302)
}))
