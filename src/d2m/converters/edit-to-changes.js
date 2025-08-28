// @ts-check

const assert = require("assert").strict

const passthrough = require("../../passthrough")
const {sync, select, from} = passthrough
/** @type {import("./message-to-event")} */
const messageToEvent = sync.require("../converters/message-to-event")
/** @type {import("../../m2d/converters/utils")} */
const utils = sync.require("../../m2d/converters/utils")

function eventCanBeEdited(ev) {
	// Discord does not allow files, images, attachments, or videos to be edited.
	if (ev.old.event_type === "m.room.message" && ev.old.event_subtype !== "m.text" && ev.old.event_subtype !== "m.emote" && ev.old.event_subtype !== "m.notice") {
		return false
	}
	// Discord does not allow stickers to be edited.
	if (ev.old.event_type === "m.sticker") {
		return false
	}
	// Anything else is fair game.
	return true
}

function eventIsText(ev) {
	return ev.old.event_type === "m.room.message" && (ev.old.event_subtype === "m.text" || ev.old.event_subtype === "m.notice")
}

/**
 * @param {import("discord-api-types/v10").GatewayMessageCreateDispatchData} message
 * @param {import("discord-api-types/v10").APIGuild} guild
 * @param {import("../../matrix/api")} api simple-as-nails dependency injection for the matrix API
 */
async function editToChanges(message, guild, api) {
	// If it is a user edit, allow deleting old messages (e.g. they might have removed text from an image).
	// If it is the system adding a generated embed to a message, don't delete old messages since the system only sends partial data.
	// Since an update in August 2024, the system always provides the full data of message updates. I'll leave in the old code since it won't cause problems.

	const isGeneratedEmbed = !("content" in message)

	// Figure out what events we will be replacing

	const roomID = select("channel_room", "room_id", {channel_id: message.channel_id}).pluck().get()
	assert(roomID)
	const oldEventRows = select("event_message", ["event_id", "event_type", "event_subtype", "part", "reaction_part"], {message_id: message.id}).all()

	/** @type {string?} Null if we don't have a sender in the room, which will happen if it's a webhook's message. The bridge bot will do the edit instead. */
	let senderMxid = null
	if (message.author) {
		senderMxid = from("sim").join("sim_member", "mxid").where({user_id: message.author.id, room_id: roomID}).pluck("mxid").get() || null
	} else {
		// Should be a system generated embed. We want the embed to be sent by the same user who sent the message, so that the messages get grouped in most clients.
		const eventID = oldEventRows[0].event_id // a calling function should have already checked that there is at least one message to edit
		const event = await api.getEvent(roomID, eventID)
		if (utils.eventSenderIsFromDiscord(event.sender)) {
			senderMxid = event.sender
		}
	}

	// Figure out what we will be replacing them with

	const newFallbackContent = await messageToEvent.messageToEvent(message, guild, {includeEditFallbackStar: true}, {api})
	const newInnerContent = await messageToEvent.messageToEvent(message, guild, {includeReplyFallback: false}, {api})
	assert.ok(newFallbackContent.length === newInnerContent.length)

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
	/**  4. Events that are matched and have definitely not changed, so they don't need to be edited or replaced at all. */
	let unchangedEvents = []

	function shift() {
		newFallbackContent.shift()
		newInnerContent.shift()
	}

	// For each old event...
	outer: while (newFallbackContent.length) {
		const newe = newFallbackContent[0]
		// Find a new event to pair it with...
		for (let i = 0; i < oldEventRows.length; i++) {
			const olde = oldEventRows[i]
			if (olde.event_type === newe.$type && olde.event_subtype === (newe.msgtype || null)) { // The spec does allow subtypes to change, so I can change this condition later if I want to
				// Found one!
				// Set up the pairing
				eventsToReplace.push({
					old: olde,
					newFallbackContent: newFallbackContent[0],
					newInnerContent: newInnerContent[0]
				})
				// These events have been handled now, so remove them from the source arrays
				shift()
				oldEventRows.splice(i, 1)
				// Go all the way back to the start of the next iteration of the outer loop
				continue outer
			}
		}
		// If we got this far, we could not pair it to an existing event, so it'll have to be a new one
		eventsToSend.push(newInnerContent[0])
		shift()
	}
	// Anything remaining in oldEventRows is present in the old version only and should be redacted.
	eventsToRedact = oldEventRows.map(e => ({old: e}))

	// If this is a generated embed update, only allow the embeds to be updated, since the system only sends data about events. Ignore changes to other things.
	if (isGeneratedEmbed) {
		unchangedEvents.push(...eventsToRedact.filter(e => e.old.event_subtype !== "m.notice")) // Move them from eventsToRedact to unchangedEvents.
		eventsToRedact = eventsToRedact.filter(e => e.old.event_subtype === "m.notice")
	}

	// Now, everything in eventsToSend and eventsToRedact is a real change, but everything in eventsToReplace might not have actually changed!
	// (Example: a MESSAGE_UPDATE for a text+image message - Discord does not allow the image to be changed, but the text might have been.)
	// So we'll remove entries from eventsToReplace that *definitely* cannot have changed. (This is category 4 mentioned above.) Everything remaining *may* have changed.
	unchangedEvents.push(...eventsToReplace.filter(ev => !eventCanBeEdited(ev))) // Move them from eventsToRedact to unchangedEvents.
	eventsToReplace = eventsToReplace.filter(eventCanBeEdited)

	// Now, everything in eventsToReplace has the potential to have changed, but did it actually?
	// (Example: if a URL preview was generated or updated, the message text won't have changed.)
	// Only way to detect this is by text content. So we'll remove text events from eventsToReplace that have the same new text as text currently in the event.
	for (let i = eventsToReplace.length; i--;) { // move backwards through array
		const event = eventsToReplace[i]
		if (!eventIsText(event)) continue // not text, can't analyse
		const oldEvent = await api.getEvent(roomID, eventsToReplace[i].old.event_id)
		const oldEventBodyWithoutQuotedReply = oldEvent.content.body?.replace(/^(>.*\n)*\n*/sm, "")
		if (oldEventBodyWithoutQuotedReply !== event.newInnerContent.body) continue // event changed, must replace it
		// Move it from eventsToRedact to unchangedEvents.
		unchangedEvents.push(...eventsToReplace.filter(ev => ev.old.event_id === event.old.event_id))
		eventsToReplace = eventsToReplace.filter(ev => ev.old.event_id !== event.old.event_id)
	}

	// We want to maintain exactly one part = 0 and one reaction_part = 0 database row at all times.
	// This would be disrupted if existing events that are (reaction_)part = 0 will be redacted.
	// If that is the case, pick a different existing or newly sent event to be (reaction_)part = 0.
	/** @type {({column: string, eventID: string, value?: number} | {column: string, nextEvent: true})[]} */
	const promotions = []
	for (const column of ["part", "reaction_part"]) {
		const candidatesForParts = unchangedEvents.concat(eventsToReplace)
		// If no events with part = 0 exist (or will exist), we need to do some management.
		if (!candidatesForParts.some(e => e.old[column] === 0)) {
			// Try to find an existing event to promote. Bigger order is better.
			if (candidatesForParts.length) {
				const order = e => 2*+(e.event_type === "m.room.message") + 1*+(e.old.event_subtype === "m.text")
				candidatesForParts.sort((a, b) => order(b) - order(a))
				if (column === "part") {
					promotions.push({column, eventID: candidatesForParts[0].old.event_id}) // part should be the first one
				} else if (eventsToSend.length) {
					promotions.push({column, nextEvent: true}) // reaction_part should be the last one
				} else {
					promotions.push({column, eventID: candidatesForParts[candidatesForParts.length - 1].old.event_id}) // reaction_part should be the last one
				}
			}
			// Or, if there are no existing events to promote and new events will be sent, whatever gets sent will be the next part = 0.
			else {
				promotions.push({column, nextEvent: true})
			}
		}
	}

	// If adding events, try to keep reactions attached to the bottom of the group (unless reactions have already been added)
	if (eventsToSend.length && !promotions.length) {
		const existingReaction = select("reaction", "message_id", {message_id: message.id}).pluck().get()
		if (!existingReaction) {
			const existingPartZero = unchangedEvents.concat(eventsToReplace).find(p => p.old.reaction_part === 0)
			assert(existingPartZero) // will exist because a reaction_part=0 always exists and no events are being removed
			promotions.push({column: "reaction_part", eventID: existingPartZero.old.event_id, value: 1}) // update the current reaction_part to 1
			promotions.push({column: "reaction_part", nextEvent: true}) // the newly created event will have reaction_part = 0
		}
	}

	// Removing unnecessary properties before returning
	eventsToRedact = eventsToRedact.map(e => e.old.event_id)
	eventsToReplace = eventsToReplace.map(e => ({oldID: e.old.event_id, newContent: makeReplacementEventContent(e.old.event_id, e.newFallbackContent, e.newInnerContent)}))

	return {roomID, eventsToReplace, eventsToRedact, eventsToSend, senderMxid, promotions}
}

/**
 * @template T
 * @param {string} oldID
 * @param {T} newFallbackContent
 * @param {T} newInnerContent
 * @returns {import("../../types").Event.ReplacementContent<T>} content
 */
function makeReplacementEventContent(oldID, newFallbackContent, newInnerContent) {
	const content = {
		...newFallbackContent,
		"m.mentions": {},
		"m.new_content": {
			...newInnerContent
		},
		"m.relates_to": {
			rel_type: "m.replace",
			event_id: oldID
		}
	}
	delete content["m.new_content"]["$type"]
	// Client-Server API spec 11.37.3: Any m.relates_to property within m.new_content is ignored.
	delete content["m.new_content"]["m.relates_to"]
	return content
}

module.exports.editToChanges = editToChanges
