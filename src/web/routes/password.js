// @ts-check

const {z} = require("zod")
const {defineEventHandler, readValidatedBody, sendRedirect} = require("h3")
const {as, sync} = require("../../passthrough")

/** @type {import("../auth")} */
const auth = sync.require("../auth")

const schema = {
	password: z.object({
		password: z.string()
	})
}

as.router.post("/api/password", defineEventHandler(async event => {
	const {password} = await readValidatedBody(event, schema.password.parse)
	const session = await auth.useSession(event)
	await session.update({password})
	return sendRedirect(event, "../")
}))
