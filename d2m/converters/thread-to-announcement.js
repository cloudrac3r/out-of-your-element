// @ts-check

const assert = require("assert").strict

const passthrough = require("../../passthrough")
const {discord, sync, db, select} = passthrough
/** @type {import("../../m2d/converters/utils")} */
const mxUtils = sync.require("../../m2d/converters/utils")
const {reg} = require("../../matrix/read-registration.js")

const userRegex = reg.namespaces.users.map(u => new RegExp(u.regex))

/**
 * @param {string} parentRoomID
 * @param {string} threadRoomID
 * @param {string?} creatorMxid
 * @param {import("discord-api-types/v10").APIThreadChannel} thread
 * @param {{api: import("../../matrix/api")}} di simple-as-nails dependency injection for the matrix API
 */
async function threadToAnnouncement(parentRoomID, threadRoomID, creatorMxid, thread, di) {
	const branchedFromEventID = select("event_message", "event_id", {message_id: thread.id}).pluck().get()
	/** @type {{"m.mentions"?: any, "m.in_reply_to"?: any}} */
	const context = {}
	if (branchedFromEventID) {
		// Need to figure out who sent that event...
		const event = await di.api.getEvent(parentRoomID, branchedFromEventID)
		context["m.relates_to"] = {"m.in_reply_to": {event_id: event.event_id}}
		if (event.sender && !userRegex.some(rx => event.sender.match(rx))) context["m.mentions"] = {user_ids: [event.sender]}
	}

	const msgtype = creatorMxid ? "m.emote" : "m.text"
	const template = creatorMxid ? "started a thread:" : "Thread started:"
	const via = await mxUtils.getViaServersQuery(threadRoomID, di.api)
	let body = `${template} ${thread.name} https://matrix.to/#/${threadRoomID}?${via.toString()}`
	let html = `${template} <a href="https://matrix.to/#/${threadRoomID}?${via.toString()}">${thread.name}</a>`

	return {
		msgtype,
		body,
		format: "org.matrix.custom.html",
		formatted_body: html,
		"m.mentions": {},
		...context
	}
}

module.exports.threadToAnnouncement = threadToAnnouncement
