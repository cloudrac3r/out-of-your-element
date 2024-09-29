const {test} = require("supertape")
const data = require("../../../test/data")
const {_interact} = require("./matrix-info")

test("matrix info: checks if message is bridged", async t => {
	const msg = await _interact({
		data: {
			target_id: "0"
		},
		guild_id: "112760669178241024"
	}, {})
	t.equal(msg.data.content, "This message hasn't been bridged to Matrix.")
})

test("matrix info: shows info for discord source message", async t => {
	const msg = await _interact({
		data: {
			target_id: "1141619794500649020",
			resolved: {
				messages: {
					"1141619794500649020": data.message_update.edit_by_webhook
				}
			}
		},
		guild_id: "497159726455455754"
	}, {})
	t.equal(
		msg.data.content,
		"Bridged <@700285844094845050> https://discord.com/channels/497159726455455754/497161350934560778/1141619794500649020 on Discord to [amanda-spam](<https://matrix.to/#/!CzvdIdUQXgUjDVKxeU:cadence.moe/$zXSlyI78DQqQwwfPUSzZ1b-nXzbUrCDljJgnGDdoI10>) on Matrix."
		+ "\n-# Room ID: `!CzvdIdUQXgUjDVKxeU:cadence.moe`"
		+ "\n-# Event ID: `$zXSlyI78DQqQwwfPUSzZ1b-nXzbUrCDljJgnGDdoI10`"
	)
})

test("matrix info: shows info for matrix source message", async t => {
	let called = 0
	const msg = await _interact({
		data: {
			target_id: "1128118177155526666",
			resolved: {
				messages: {
					"1141501302736695316": data.message.simple_reply_to_matrix_user
				}
			}
		},
		guild_id: "112760669178241024"
	}, {
		api: {
			async getEvent(roomID, eventID) {
				called++
				t.equal(roomID, "!kLRqKKUQXcibIMtOpl:cadence.moe")
				t.equal(eventID, "$Ij3qo7NxMA4VPexlAiIx2CB9JbsiGhJeyt-2OvkAUe4")
				return {
					event_id: eventID,
					room_id: roomID,
					type: "m.room.message",
					content: {
						msgtype: "m.text",
						body: "so can you reply to my webhook uwu"
					},
					sender: "@cadence:cadence.moe"
				}
			}
		}
	})
	t.equal(
		msg.data.content,
		"Bridged [@cadence:cadence.moe](<https://matrix.to/#/@cadence:cadence.moe>)'s message in [main](<https://matrix.to/#/!kLRqKKUQXcibIMtOpl:cadence.moe/$Ij3qo7NxMA4VPexlAiIx2CB9JbsiGhJeyt-2OvkAUe4>) on Matrix to https://discord.com/channels/112760669178241024/112760669178241024/1128118177155526666 on Discord."
		+ "\n-# Room ID: `!kLRqKKUQXcibIMtOpl:cadence.moe`"
		+ "\n-# Event ID: `$Ij3qo7NxMA4VPexlAiIx2CB9JbsiGhJeyt-2OvkAUe4`"
	)
	t.equal(called, 1)
})
