// @ts-check

const {z} = require("zod")
const {defineEventHandler, getValidatedQuery, H3Event} = require("h3")
const {as, from, sync, select} = require("../../passthrough")

/** @type {import("../../matrix/utils")} */
const mUtils = sync.require("../../matrix/utils")

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
	const metadatas = from("event_message").join("message_room", "message_id").join("historical_channel_room", "historical_room_index").where({message_id})
		.select("event_id", "event_type", "event_subtype", "part", "reaction_part", "reference_channel_id", "room_id", "source").and("ORDER BY part ASC, reaction_part DESC").all()

	if (metadatas.length === 0) {
		return new Response("Message not found", {status: 404, statusText: "Not Found"})
	}

	const current_room_id = select("channel_room", "room_id", {channel_id: metadatas[0].reference_channel_id}).pluck().get()
	const events = await Promise.all(metadatas.map(metadata =>
		api.getEvent(metadata.room_id, metadata.event_id).then(raw => ({
			metadata: {
				event_id: metadata.event_id,
				event_type: metadata.event_type,
				event_subtype: metadata.event_subtype,
				part: metadata.part,
				reaction_part: metadata.reaction_part,
				channel_id: metadata.reference_channel_id,
				room_id: metadata.room_id,
				source: metadata.source,
				sender: raw.sender,
				current_room_id: current_room_id
			},
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
