// @ts-check

const {z} = require("zod")
const {defineEventHandler, getValidatedQuery, H3Event} = require("h3")
const {as, from, sync, select} = require("../../passthrough")

/** @type {import("../../m2d/converters/utils")} */
const mUtils = sync.require("../../m2d/converters/utils")

/**
 * @param {H3Event} event
 * @returns {import("../../matrix/api")}
 */
function getAPI(event) {
	/* c8 ignore next */
	return event.context.api || sync.require("../../matrix/api")
}

const schema = {
	message: z.object({
		message_id: z.string().regex(/^[0-9]+$/)
	})
}

as.router.get("/api/message", defineEventHandler(async event => {
	const api = getAPI(event)

	const {message_id} = await getValidatedQuery(event, schema.message.parse)
	const metadatas = from("event_message").join("message_channel", "message_id").join("channel_room", "channel_id").where({message_id})
		.select("event_id", "event_type", "event_subtype", "part", "reaction_part", "room_id", "source").and("ORDER BY part ASC, reaction_part DESC").all()

	if (metadatas.length === 0) {
		return new Response("Message not found", {status: 404, statusText: "Not Found"})
	}

	const events = await Promise.all(metadatas.map(metadata =>
		api.getEvent(metadata.room_id, metadata.event_id).then(raw => ({
			metadata: Object.assign({sender: raw.sender}, metadata),
			raw
		}))
	))

	/* c8 ignore next */
	const primary = events.find(e => e.metadata.part === 0) || events[0]
	const mxid = primary.metadata.sender
	const source = primary.metadata.source === 0 ? "matrix" : "discord"

	let matrix_author = undefined
	if (source === "matrix") {
		matrix_author = select("member_cache", ["displayname", "avatar_url", "mxid"], {room_id: primary.metadata.room_id, mxid}).get()
		if (!matrix_author) {
			try {
				matrix_author = await api.getProfile(mxid)
			} catch (e) {
				matrix_author = {}
			}
		}
		if (!matrix_author.displayname) matrix_author.displayname = mxid
		if (matrix_author.avatar_url) matrix_author.avatar_url = mUtils.getPublicUrlForMxc(matrix_author.avatar_url)
		else matrix_author.avatar_url = null
		matrix_author["mxid"] = mxid
	}

	return {source, matrix_author, events}
}))
