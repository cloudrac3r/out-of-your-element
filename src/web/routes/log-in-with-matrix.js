// @ts-check

const {z} = require("zod")
const {randomUUID} = require("crypto")
const {defineEventHandler, getValidatedQuery, sendRedirect, readValidatedBody, createError, getRequestHeader, H3Event} = require("h3")
const {LRUCache} = require("lru-cache")

const {as, db, select} = require("../../passthrough")
const {reg} = require("../../matrix/read-registration")

const {sync} = require("../../passthrough")
const assert = require("assert").strict
/** @type {import("../pug-sync")} */
const pugSync = sync.require("../pug-sync")
/** @type {import("../auth")} */
const auth = sync.require("../auth")

const schema = {
	form: z.object({
		mxid: z.string().regex(/^@([^:]+):([a-z0-9:-]+\.[a-z0-9.:-]+)$/),
		next: z.string().optional()
	}),
	token: z.object({
		token: z.string().optional(),
		next: z.string().optional()
	})
}

/**
 * @param {H3Event} event
 * @returns {import("../../matrix/api")}
 */
function getAPI(event) {
	/* c8 ignore next */
	return event.context.api || sync.require("../../matrix/api")
}

/** @type {LRUCache<string, string>} token to mxid */
const validToken = new LRUCache({max: 200})

/*
	1st request, GET, they clicked the button, need to input their mxid
	2nd request, POST, they input their mxid and we need to send a link
	3rd request, GET, they clicked the link and we need to set the session data (just their mxid)
*/

as.router.get("/log-in-with-matrix", defineEventHandler(async event => {
	let {token, next} = await getValidatedQuery(event, schema.token.parse)

	if (!token) {
		// We are in the first request and need to tell them to input their mxid
		return pugSync.render(event, "log-in-with-matrix.pug", {next})
	}

	const userAgent = getRequestHeader(event, "User-Agent")
	if (userAgent?.match(/bot|matrix/)) throw createError({status: 400, data: "Sorry URL previewer, you can't have this URL."})

	if (!validToken.has(token)) return sendRedirect(event, `${reg.ooye.bridge_origin}/log-in-with-matrix`, 302)

	const session = await auth.useSession(event)
	const mxid = validToken.get(token)
	assert(mxid)
	validToken.delete(token)

	await session.update({mxid})

	if (!next) next = "./" // open to homepage where they can see they're logged in
	return sendRedirect(event, next, 302)
}))

as.router.post("/api/log-in-with-matrix", defineEventHandler(async event => {
	const api = getAPI(event)
	const {mxid, next} = await readValidatedBody(event, schema.form.parse)

	// Don't extend a duplicate invite for the same user
	for (const alreadyInvited of validToken.values()) {
		if (mxid === alreadyInvited) {
			return sendRedirect(event, "../ok?msg=We already sent you a link on Matrix. Please click it!", 302)
		}
	}

	// Check if we have an existing DM
	let roomID = select("direct", "room_id", {mxid}).pluck().get()
	if (roomID) {
		// Check that the person is/still in the room
		try {
			var member = await api.getStateEvent(roomID, "m.room.member", mxid)
		} catch (e) {}

		// Invite them back to the room if needed
		if (!member || member.membership === "leave") {
			await api.inviteToRoom(roomID, mxid)
		}
	}

	// No existing DM, create a new room and invite
	else {
		roomID = await api.createRoom({
			invite: [mxid],
			is_direct: true,
			preset: "trusted_private_chat"
		})
		// Store the newly created room in account data (Matrix doesn't do this for us automatically, sigh...)
		db.prepare("REPLACE INTO direct (mxid, room_id) VALUES (?, ?)").run(mxid, roomID)
	}

	const token = randomUUID()

	console.log(`web log in requested for ${mxid}`)
	const paramsObject = {token}
	if (next) paramsObject.next = next
	const params = new URLSearchParams(paramsObject)
	let link = `${reg.ooye.bridge_origin}/log-in-with-matrix?${params.toString()}`
	const body = `Hi, this is Out Of Your Element! You just clicked the "log in" button on the website.\nOpen this link to finish: ${link}\nThe link can be used once.`
	await api.sendEvent(roomID, "m.room.message", {
		msgtype: "m.text",
		body
	})

	validToken.set(token, mxid)

	return sendRedirect(event, "../ok?msg=Please check your inbox on Matrix!&spot=SpotMailXL", 302)
}))
