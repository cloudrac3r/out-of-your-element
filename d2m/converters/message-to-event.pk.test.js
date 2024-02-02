const {test} = require("supertape")
const {messageToEvent} = require("./message-to-event")
const data = require("../../test/data")
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

test("message2event: pk reply is converted to native matrix reply", async t => {
	const events = await messageToEvent(data.pk_message.pk_reply, {}, {}, {
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
		body: "> cadence: now for my next experiment:\n\nthis is a reply",
		format: "org.matrix.custom.html",
		formatted_body: '<mx-reply><blockquote><a href="https://matrix.to/#/!TqlyQmifxGUggEmdBN:cadence.moe/$NB6nPgO2tfXyIwwDSF0Ga0BUrsgX1S-0Xl-jAvI8ucU">In reply to</a> <a href="https://matrix.to/#/@cadence:cadence.moe">cadence</a><br>'
			+ "now for my next experiment:</blockquote></mx-reply>"
			+ "this is a reply",
		"m.relates_to": {
			"m.in_reply_to": {
				event_id: "$NB6nPgO2tfXyIwwDSF0Ga0BUrsgX1S-0Xl-jAvI8ucU"
			}
		}
	}])
})
