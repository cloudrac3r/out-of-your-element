// @ts-check

const {test} = require("supertape")
const assert = require("assert")
const {eventToMessage} = require("./event-to-message")
const data = require("../../test/data")

test("event2message: janky test", t => {
	t.deepEqual(
		eventToMessage({
			age: 405299,
			content: {
				body: "test",
				msgtype: "m.text"
			},
			event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOU",
			origin_server_ts: 1688301929913,
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
			sender: "@cadence:cadence.moe",
			type: "m.room.message",
			unsigned: {
				age: 405299
			},
			user_id: "@cadence:cadence.moe"
		}),
		[{
			username: "cadence:cadence.moe",
			content: "test",
			avatar_url: undefined
		}]
	)
})
