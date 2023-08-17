async function editMessage() {
   	// Action time!

	// 1. Replace all the things.


	// 2. Redact all the things.

	// 3. Send all the things.

	// old code lies here
	let eventPart = 0 // TODO: what to do about eventPart when editing? probably just need to make sure that exactly 1 value of '0' remains in the database?
	for (const event of events) {
		const eventType = event.$type
		/** @type {Pick<typeof event, Exclude<keyof event, "$type">> & { $type?: string }} */
		const eventWithoutType = {...event}
		delete eventWithoutType.$type

		const eventID = await api.sendEvent(roomID, eventType, event, senderMxid)
		db.prepare("INSERT INTO event_message (event_id, message_id, channel_id, part, source) VALUES (?, ?, ?, ?, 1)").run(eventID, message.id, message.channel_id, eventPart) // source 1 = discord

		eventPart = 1 // TODO: use more intelligent algorithm to determine whether primary or supporting
		eventIDs.push(eventID)
	}

	return eventIDs

{eventsToReplace, eventsToRedact, eventsToSend}
