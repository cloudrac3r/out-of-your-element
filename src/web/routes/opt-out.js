// @ts-check

const assert = require("assert/strict")
const {z} = require("zod")
const {defineEventHandler, createError, readValidatedBody, getRequestHeader, setResponseHeader, sendRedirect, H3Event} = require("h3")

const {as, db, sync, select, discord} = require("../../passthrough")

/** @type {import("../auth")} */
const auth = sync.require("../auth")
/** @type {import("../pug-sync")} */
const pugSync = sync.require("../pug-sync")

const schema = {
	optOut: z.object({
		opt_in: z.string().optional() // switch is reversed, you turn it on to opt in
	})
}

as.router.post("/api/opt-out", defineEventHandler(async event => {
	// CSRF prevention for a more important endpoint
	if (!getRequestHeader(event, "HX-Request")) {
		throw createError({status: 403, message: "Forbidden", data: "JavaScript is required for the opt-out form."})
	}

	const session = await auth.useSession(event)
	if (!session.data.userID) {
		throw createError({status: 401, message: "Unauthorised", data: "Log in first."})
	}

	const parsedBody = await readValidatedBody(event, schema.optOut.parse)
	const isOptIn = !!parsedBody.opt_in

	if (isOptIn) {
		db.prepare("DELETE FROM opt_out WHERE user_id = ?").run(session.data.userID)
		var msg = "You have opted in."
	} else {
		db.prepare("INSERT OR IGNORE INTO opt_out (user_id, opted_out_at) VALUES (?, ?)").run(session.data.userID, Date.now())
		var msg = "You have opted out."
	}

	return sendRedirect(event, `../opt-out?${new URLSearchParams({msg})}`, 302)
}))
