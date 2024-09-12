const {test} = require("supertape")
const {messageToEvent} = require("./message-to-event")
const data = require("../../../test/data")
const Ty = require("../../types")

/**
 * @param {string} roomID
 * @param {string} eventID
 * @returns {(roomID: string, eventID: string) => Promise<Ty.Event.Outer<Ty.Event.M_Room_Message>>}
 */
function mockGetEvent(t, roomID_in, eventID_in, outer) {
	return async function(roomID, eventID) {
		t.equal(roomID, roomID_in)
		t.equal(eventID, eventID_in)
		return new Promise(resolve => {
			setTimeout(() => {
				resolve({
					event_id: eventID_in,
					room_id: roomID_in,
					origin_server_ts: 1680000000000,
					unsigned: {
						age: 2245,
						transaction_id: "$local.whatever"
					},
					...outer
				})
			})
		})
	}
}

test("message2event: pk reply to matrix is converted to native matrix reply", async t => {
	const events = await messageToEvent(data.pk_message.pk_reply_to_matrix, {}, {}, {
		api: {
			getEvent: mockGetEvent(t, "!TqlyQmifxGUggEmdBN:cadence.moe", "$NB6nPgO2tfXyIwwDSF0Ga0BUrsgX1S-0Xl-jAvI8ucU", {
				type: "m.room.message",
				sender: "@cadence:cadence.moe",
				content: {
					msgtype: "m.text",
					body: "now for my next experiment:"
				}
			})
		}
	})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {
			user_ids: [
				"@cadence:cadence.moe"
			]
		},
		msgtype: "m.text",
		body: "> cadence [they]: now for my next experiment:\n\nthis is a reply",
		format: "org.matrix.custom.html",
		formatted_body: '<mx-reply><blockquote><a href="https://matrix.to/#/!TqlyQmifxGUggEmdBN:cadence.moe/$NB6nPgO2tfXyIwwDSF0Ga0BUrsgX1S-0Xl-jAvI8ucU">In reply to</a> <a href="https://matrix.to/#/@cadence:cadence.moe">cadence [they]</a><br>'
			+ "now for my next experiment:</blockquote></mx-reply>"
			+ "this is a reply",
		"m.relates_to": {
			"m.in_reply_to": {
				event_id: "$NB6nPgO2tfXyIwwDSF0Ga0BUrsgX1S-0Xl-jAvI8ucU"
			}
		}
	}])
})

test("message2event: pk reply to discord is converted to native matrix reply", async t => {
	const events = await messageToEvent(data.pk_message.pk_reply_to_discord, {}, {}, {
		api: {
			getEvent: mockGetEvent(t, "!TqlyQmifxGUggEmdBN:cadence.moe", "$NB6nPgO2tfXyIwwDSF0Ga0BUrsgX1S-0Xl-jAvI8ucU", {
				type: "m.room.message",
				sender: "@_ooye_.wing.:cadence.moe",
				content: {
					msgtype: "m.text",
					body: "some text"
				}
			})
		}
	})
	t.deepEqual(events, [{
		$type: "m.room.message",
		msgtype: "m.text",
		"m.mentions": {},
		body: "> wing: some text\n\nthis is a reply",
		format: "org.matrix.custom.html",
		formatted_body: '<mx-reply><blockquote><a href="https://matrix.to/#/!kLRqKKUQXcibIMtOpl:cadence.moe/$mtR8cJqM4fKno1bVsm8F4wUVqSntt2sq6jav1lyavuA">In reply to</a> wing<br>'
			+ "some text</blockquote></mx-reply>"
			+ "this is a reply",
		"m.relates_to": {
			"m.in_reply_to": {
				event_id: "$mtR8cJqM4fKno1bVsm8F4wUVqSntt2sq6jav1lyavuA"
			}
		}
	}])
})

test("message2event: pk reply to matrix attachment is converted to native matrix reply", async t => {
	const events = await messageToEvent(data.pk_message.pk_reply_to_matrix_attachment, {}, {}, {
		api: {
			getEvent: mockGetEvent(t, "!TqlyQmifxGUggEmdBN:cadence.moe", "$OEEK-Wam2FTh6J-6kVnnJ6KnLA_lLRnLTHatKKL62-Y", {
				sender: "@ampflower:matrix.org",
				type: "m.room.message",
				content: {
					body: "catnod.gif",
					filename: "catnod.gif",
					info: {
						h: 128,
						mimetype: "image/gif",
						size: 20816,
						w: 128
					},
					msgtype: "m.image",
					url: "mxc://matrix.org/jtzXIawXCkFIHSsMUNsKkUJX"
				}
			})
		}
	})
	t.deepEqual(events, [{
		$type: "m.room.message",
		msgtype: "m.text",
		"m.mentions": {
			user_ids: ["@ampflower:matrix.org"]
		},
		body: "> Ampflower 🌺: [Media]\n\nCat nod",
		format: "org.matrix.custom.html",
		formatted_body: '<mx-reply><blockquote><a href="https://matrix.to/#/!TqlyQmifxGUggEmdBN:cadence.moe/$OEEK-Wam2FTh6J-6kVnnJ6KnLA_lLRnLTHatKKL62-Y">In reply to</a> <a href="https://matrix.to/#/@ampflower:matrix.org">Ampflower 🌺</a><br>'
			+ "[Media]</blockquote></mx-reply>"
			+ "Cat nod",
		"m.relates_to": {
			"m.in_reply_to": {
				event_id: "$OEEK-Wam2FTh6J-6kVnnJ6KnLA_lLRnLTHatKKL62-Y"
			}
		}
	}])
})
