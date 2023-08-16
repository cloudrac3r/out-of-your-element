// @ts-check

const assert = require("assert")

const passthrough = require("../../passthrough")
const { discord, sync, db } = passthrough
/** @type {import("./message-to-event")} */
const messageToEvent = sync.require("../converters/message-to-event")
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("../actions/register-user")} */
const registerUser = sync.require("../actions/register-user")
/** @type {import("../actions/create-room")} */
const createRoom = sync.require("../actions/create-room")

/**
 * @param {import("discord-api-types/v10").GatewayMessageCreateDispatchData} message
 * IMPORTANT: This may not have all the normal fields! The API documentation doesn't provide possible types, just says it's all optional!
 * Since I don't have a spec, I will have to capture some real traffic and add it as test cases... I hope they don't change anything later...
 * @param {import("discord-api-types/v10").APIGuild} guild
 */
async function editToChanges(message, guild) {
	// Figure out what events we will be replacing

	const roomID = db.prepare("SELECT room_id FROM channel_room WHERE channel_id = ?").pluck().get(message.channel_id)
	const senderMxid = await registerUser.ensureSimJoined(message.author, roomID)
	/** @type {{event_id: string, event_type: string, event_subtype: string?, part: number}[]} */
   const oldEventRows = db.prepare("SELECT event_id, event_type, event_subtype, part FROM event_message WHERE message_id = ?").all(message.id)

	// Figure out what we will be replacing them with

	const newEvents = await messageToEvent.messageToEvent(message, guild, api)

	// Match the new events to the old events

	/*
		Rules:
			+ The events must have the same type.
			+ The events must have the same subtype.
		Events will therefore be divided into four categories:
	*/
	/** 1. Events that are matched, and should be edited by sending another m.replace event */
	let eventsToReplace = []
	/** 2. Events that are present in the old version only, and should be blanked or redacted */
	let eventsToRedact = []
	/** 3. Events that are present in the new version only, and should be sent as new, with references back to the context */
	let eventsToSend = []
	//  4. Events that are matched and have definitely not changed, so they don't need to be edited or replaced at all. This is represented as nothing.

	// For each old event...
	outer: while (newEvents.length) {
		const newe = newEvents[0]
		// Find a new event to pair it with...
		for (let i = 0; i < oldEventRows.length; i++) {
			const olde = oldEventRows[i]
			if (olde.event_type === newe.$type && olde.event_subtype === (newe.msgtype || null)) {
				// Found one!
				// Set up the pairing
				eventsToReplace.push({
					old: olde,
					new: newe
				})
				// These events have been handled now, so remove them from the source arrays
				newEvents.shift()
				oldEventRows.splice(i, 1)
				// Go all the way back to the start of the next iteration of the outer loop
				continue outer
			}
		}
		// If we got this far, we could not pair it to an existing event, so it'll have to be a new one
		eventsToSend.push(newe)
		newEvents.shift()
	}
	// Anything remaining in oldEventRows is present in the old version only and should be redacted.
	eventsToRedact = oldEventRows

	// Now, everything in eventsToSend and eventsToRedact is a real change, but everything in eventsToReplace might not have actually changed!
	// (Consider a MESSAGE_UPDATE for a text+image message - Discord does not allow the image to be changed, but the text might have been.)
	// So we'll remove entries from eventsToReplace that *definitely* cannot have changed. (This is category 4 mentioned above.) Everything remaining *may* have changed.
	eventsToReplace = eventsToReplace.filter(ev => {
		// Discord does not allow files, images, attachments, or videos to be edited.
		if (ev.old.event_type === "m.room.message" && ev.old.event_subtype !== "m.text" && ev.old.event_subtype !== "m.emote") {
			return false
		}
		// Discord does not allow stickers to be edited.
		if (ev.old.event_type === "m.sticker") {
			return false
		}
		// Anything else is fair game.
		return true
	})

	// Removing unnecessary properties before returning
	eventsToRedact = eventsToRedact.map(e => e.event_id)
	eventsToReplace = eventsToReplace.map(e => ({oldID: e.old.event_id, new: eventToReplacementEvent(e.old.event_id, e.new)}))

	return {eventsToReplace, eventsToRedact, eventsToSend}
}

/**
 * @template T
 * @param {string} oldID
 * @param {T} content
 * @returns {import("../../types").Event.ReplacementContent<T>} content
 */
function eventToReplacementEvent(oldID, content) {
	const newContent = {
		...content,
		"m.mentions": {},
		"m.new_content": {
			...content
		},
		"m.relates_to": {
			rel_type: "m.replace",
			event_id: oldID
		}
	}
	if (typeof newContent.body === "string") {
		newContent.body = "* " + newContent.body
	}
	if (typeof newContent.formatted_body === "string") {
		newContent.formatted_body = "* " + newContent.formatted_body
	}
	delete newContent["m.new_content"]["$type"]
	// Client-Server API spec 11.37.3: Any m.relates_to property within m.new_content is ignored.
	delete newContent["m.new_content"]["m.relates_to"]
	return newContent
}

module.exports.editToChanges = editToChanges
module.exports.eventToReplacementEvent = eventToReplacementEvent
