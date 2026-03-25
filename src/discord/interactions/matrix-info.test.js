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
			},
			async getJoinedMembers(roomID) {
				return {
					joined: {}
				}
			},
			async getStateEventOuter(roomID, type, key) {
				return {
					content: {
						room_version: "11"
					}
				}
			},
			async getStateEvent(roomID, type, key) {
				return {}
			}
		}
	})
	t.equal(
		msg.data.embeds[0].fields[1].value,
		"\n-# Room ID: `!kLRqKKUQXcibIMtOpl:cadence.moe`"
		+ "\n-# Event ID: `$Ij3qo7NxMA4VPexlAiIx2CB9JbsiGhJeyt-2OvkAUe4`"
	)
	t.equal(called, 1)
})

test("matrix info: shows username for per-message profile", async t => {
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
						body: "master chief: i like the halo",
						format: "org.matrix.custom.html",
						formatted_body: "<strong>master chief: </strong>i like the halo",
						"com.beeper.per_message_profile": {
							has_fallback: true,
							displayname: "master chief",
							avatar_url: ""
						}
					},
					sender: "@cadence:cadence.moe"
				}
			},
			async getJoinedMembers(roomID) {
				return {
					joined: {}
				}
			},
			async getStateEventOuter(roomID, type, key) {
				return {
					content: {
						room_version: "11"
					}
				}
			},
			async getStateEvent(roomID, type, key) {
				return {}
			}
		}
	})
	t.equal(msg.data.embeds[0].author.name, "master chief")
	t.match(msg.data.embeds[0].description, "Sent with a per-message profile")
	t.equal(called, 1)
})

test("matrix info: shows avatar for per-message profile", async t => {
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
						body: "?",
						format: "org.matrix.custom.html",
						formatted_body: "?",
						"com.beeper.per_message_profile": {
							avatar_url: "mxc://cadence.moe/HXfFuougamkURPPMflTJRxGc"
						}
					},
					sender: "@mystery:cadence.moe"
				}
			},
			async getJoinedMembers(roomID) {
				return {
					joined: {}
				}
			},
			async getStateEventOuter(roomID, type, key) {
				return {
					content: {
						room_version: "11"
					}
				}
			},
			async getStateEvent(roomID, type, key) {
				return {}
			}
		}
	})
	t.equal(msg.data.embeds[0].author.name, "@mystery:cadence.moe")
	t.equal(msg.data.embeds[0].author.icon_url, "https://bridge.example.org/download/matrix/cadence.moe/HXfFuougamkURPPMflTJRxGc")
	t.match(msg.data.embeds[0].description, "Sent with a per-message profile")
	t.equal(called, 1)
})
