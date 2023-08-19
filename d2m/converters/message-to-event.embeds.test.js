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

test("message2event embeds: nothing but a field", async t => {
	const events = await messageToEvent(data.message_with_embeds.nothing_but_a_field, data.guild.general, {})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.text",
		body: "Amanda"
	}])
})
