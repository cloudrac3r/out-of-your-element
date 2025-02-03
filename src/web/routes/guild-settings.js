// @ts-check

const assert = require("assert/strict")
const {z} = require("zod")
const {defineEventHandler, useSession, createError, readValidatedBody, getRequestHeader, setResponseHeader, sendRedirect} = require("h3")

const {as, db, sync, select} = require("../../passthrough")
const {reg} = require("../../matrix/read-registration")

/** @type {import("../../d2m/actions/create-space")} */
const createSpace = sync.require("../../d2m/actions/create-space")

/** @type {["invite", "link", "directory"]} */
const levels = ["invite", "link", "directory"]
const schema = {
	autocreate: z.object({
		guild_id: z.string(),
		autocreate: z.string().optional()
	}),
	privacyLevel: z.object({
		guild_id: z.string(),
		level: z.enum(levels)
	})
}

as.router.post("/api/autocreate", defineEventHandler(async event => {
	const parsedBody = await readValidatedBody(event, schema.autocreate.parse)
	const session = await useSession(event, {password: reg.as_token})
	if (!(session.data.managedGuilds || []).concat(session.data.matrixGuilds || []).includes(parsedBody.guild_id)) throw createError({status: 403, message: "Forbidden", data: "Can't change settings for a guild you don't have Manage Server permissions in"})

	db.prepare("UPDATE guild_active SET autocreate = ? WHERE guild_id = ?").run(+!!parsedBody.autocreate, parsedBody.guild_id)

	// If showing a partial page due to incomplete setup, need to refresh the whole page to show the alternate version
	const spaceID = select("guild_space", "space_id", {guild_id: parsedBody.guild_id}).pluck().get()
	if (!spaceID) {
		if (getRequestHeader(event, "HX-Request")) {
			setResponseHeader(event, "HX-Refresh", "true")
		} else {
			return sendRedirect(event, "", 302)
		}
	}

	return null // 204
}))

as.router.post("/api/privacy-level", defineEventHandler(async event => {
	const parsedBody = await readValidatedBody(event, schema.privacyLevel.parse)
	const session = await useSession(event, {password: reg.as_token})
	if (!(session.data.managedGuilds || []).concat(session.data.matrixGuilds || []).includes(parsedBody.guild_id)) throw createError({status: 403, message: "Forbidden", data: "Can't change settings for a guild you don't have Manage Server permissions in"})

	const i = levels.indexOf(parsedBody.level)
	assert.notEqual(i, -1)
	db.prepare("UPDATE guild_space SET privacy_level = ? WHERE guild_id = ?").run(i, parsedBody.guild_id)
	await createSpace.syncSpaceFully(parsedBody.guild_id) // this is inefficient but OK to call infrequently on user request
	return null // 204
}))
