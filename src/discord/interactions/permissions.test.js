const {test} = require("supertape")
const DiscordTypes = require("discord-api-types/v10")
const {select, db} = require("../../passthrough")
const {_interact, _interactEdit} = require("./permissions")
const {mockGetEffectivePower} = require("../../matrix/utils.test")

/**
 * @template T
 * @param {AsyncIterable<T>} ai
 * @returns {Promise<T[]>}
 */
async function fromAsync(ai) {
	const result = []
	for await (const value of ai) {
		result.push(value)
	}
	return result
}

test("permissions: checks if message is bridged", async t => {
	const msgs = await fromAsync(_interact({
		data: {
			target_id: "0"
		},
		guild_id: "0"
	}, {}))
	t.equal(msgs.length, 1)
	t.equal(msgs[0].createInteractionResponse.data.content, "The permissions command can only be used on Matrix users.")
})

test("permissions: checks if message is sent by a matrix user", async t => {
	const msgs = await fromAsync(_interact({
		data: {
			target_id: "1126786462646550579"
		},
		guild_id: "112760669178241024"
	}, {}))
	t.equal(msgs.length, 1)
	t.equal(msgs[0].createInteractionResponse.data.content, "The permissions command can only be used on Matrix users.")
})

test("permissions: reports permissions of selected matrix user (implicit default)", async t => {
	let called = 0
	const msgs = await fromAsync(_interact({
		data: {
			target_id: "1128118177155526666"
		},
		guild_id: "112760669178241024"
	}, {
		utils: {
			bot: "@_ooye_bot:cadence.moe",
			getEffectivePower: mockGetEffectivePower()
		},
		api: {
			async getEvent(roomID, eventID) {
				called++
				t.equal(roomID, "!kLRqKKUQXcibIMtOpl:cadence.moe") // room ID
				t.equal(eventID, "$Ij3qo7NxMA4VPexlAiIx2CB9JbsiGhJeyt-2OvkAUe4")
				return {
					sender: "@cadence:cadence.moe"
				}
			}
		}
	}))
	t.equal(msgs.length, 1)
	t.equal(msgs[0].createInteractionResponse.data.content, "Showing permissions for `@cadence:cadence.moe`. Click to edit.")
	t.deepEqual(msgs[0].createInteractionResponse.data.components[0].components[0].options[0], {label: "Default", value: "default", default: true})
	t.equal(called, 1)
})

test("permissions: reports permissions of selected matrix user (moderator)", async t => {
	let called = 0
	const msgs = await fromAsync(_interact({
		data: {
			target_id: "1128118177155526666"
		},
		guild_id: "112760669178241024"
	}, {
		utils: {
			bot: "@_ooye_bot:cadence.moe",
			getEffectivePower: mockGetEffectivePower(["@_ooye_bot:cadence.moe"], {"@cadence:cadence.moe": 50})
		},
		api: {
			async getEvent(roomID, eventID) {
				called++
				t.equal(roomID, "!kLRqKKUQXcibIMtOpl:cadence.moe") // room ID
				t.equal(eventID, "$Ij3qo7NxMA4VPexlAiIx2CB9JbsiGhJeyt-2OvkAUe4")
				return {
					sender: "@cadence:cadence.moe"
				}
			}
		}
	}))
	t.equal(msgs.length, 1)
	t.equal(msgs[0].createInteractionResponse.data.content, "Showing permissions for `@cadence:cadence.moe`. Click to edit.")
	t.deepEqual(msgs[0].createInteractionResponse.data.components[0].components[0].options[1], {label: "Moderator", value: "moderator", default: true})
	t.equal(called, 1)
})

test("permissions: reports permissions of selected matrix user (admin v12 can be demoted)", async t => {
	let called = 0
	const msgs = await fromAsync(_interact({
		data: {
			target_id: "1128118177155526666"
		},
		guild_id: "112760669178241024"
	}, {
		utils: {
			bot: "@_ooye_bot:cadence.moe",
			getEffectivePower: mockGetEffectivePower(["@_ooye_bot:cadence.moe"], {"@cadence:cadence.moe": 100})
		},
		api: {
			async getEvent(roomID, eventID) {
				called++
				t.equal(roomID, "!kLRqKKUQXcibIMtOpl:cadence.moe") // room ID
				t.equal(eventID, "$Ij3qo7NxMA4VPexlAiIx2CB9JbsiGhJeyt-2OvkAUe4")
				return {
					sender: "@cadence:cadence.moe"
				}
			}
		}
	}))
	t.equal(msgs.length, 1)
	t.equal(msgs[0].createInteractionResponse.data.content, "Showing permissions for `@cadence:cadence.moe`. Click to edit.")
	t.deepEqual(msgs[0].createInteractionResponse.data.components[0].components[0].options[2], {label: "Admin", value: "admin", default: true})
	t.equal(called, 1)
})

test("permissions: reports permissions of selected matrix user (admin v11 cannot be demoted)", async t => {
	let called = 0
	const msgs = await fromAsync(_interact({
		data: {
			target_id: "1128118177155526666"
		},
		guild_id: "112760669178241024"
	}, {
		utils: {
			bot: "@_ooye_bot:cadence.moe",
			getEffectivePower: mockGetEffectivePower(["@_ooye_bot:cadence.moe"], {"@cadence:cadence.moe": 100, "@_ooye_bot:cadence.moe": 100}, "11")
		},
		api: {
			async getEvent(roomID, eventID) {
				called++
				t.equal(roomID, "!kLRqKKUQXcibIMtOpl:cadence.moe") // room ID
				t.equal(eventID, "$Ij3qo7NxMA4VPexlAiIx2CB9JbsiGhJeyt-2OvkAUe4")
				return {
					sender: "@cadence:cadence.moe"
				}
			}
		}
	}))
	t.equal(msgs.length, 1)
	t.equal(msgs[0].createInteractionResponse.data.content, "`@cadence:cadence.moe` has administrator permissions. This cannot be edited.")
	t.notOk(msgs[0].createInteractionResponse.data.components)
	t.equal(called, 1)
})

test("permissions: can update user to moderator", async t => {
	let called = []
	const msgs = await fromAsync(_interactEdit({
		data: {
			target_id: "1128118177155526666",
			values: ["moderator"]
		},
		message: {
			content: "Showing permissions for `@cadence:cadence.moe`. Click to edit."
		},
		guild_id: "112760669178241024"
	}, {
		api: {
			async getStateEvent(roomID, type, key) {
				called.push("get power levels")
				t.equal(type, "m.room.power_levels")
				return {}
			},
			async getStateEventOuter(roomID, type, key) {
				called.push("get room create")
				return {
					type: "m.room.create",
					state_key: "",
					sender: "@_ooye_bot:cadence.moe",
					event_id: "$create",
					origin_server_ts: 0,
					room_id: roomID,
					content: {
						room_version: "11"
					}
				}
			},
			async *generateFullHierarchy(spaceID) {
				called.push("generate full hierarchy")
			},
			async sendState(roomID, type, key, content) {
				called.push("set power levels")
				t.ok(["!hierarchy", "!jjmvBegULiLucuWEHU:cadence.moe"].includes(roomID), `expected room ID to be in hierarchy, but was ${roomID}`)
				t.equal(type, "m.room.power_levels")
				t.equal(key, "")
				t.deepEqual(content, {
					users: {"@cadence:cadence.moe": 50}
				})
				return "$updated"
			}
		}
	}))
	t.equal(msgs.length, 2)
	t.equal(msgs[0].createInteractionResponse.data.content, "Updating `@cadence:cadence.moe` to **moderator**, please wait...")
	t.equal(msgs[1].editOriginalInteractionResponse.content, "Updated `@cadence:cadence.moe` to **moderator**.")
	t.deepEqual(called, ["generate full hierarchy", "get room create", "get power levels", "set power levels"])
})

test("permissions: can update user to default", async t => {
	let called = []
	const msgs = await fromAsync(_interactEdit({
		data: {
			target_id: "1128118177155526666",
			values: ["default"]
		},
		message: {
			content: "Showing permissions for `@cadence:cadence.moe`. Click to edit."
		},
		guild_id: "112760669178241024"
	}, {
		api: {
			async getStateEvent(roomID, type, key) {
				called.push("get power levels")
				t.equal(type, "m.room.power_levels")
				return {
					users: {"@cadence:cadence.moe": 50}
				}
			},
			async getStateEventOuter(roomID, type, key) {
				called.push("get room create")
				return {
					type: "m.room.create",
					state_key: "",
					sender: "@_ooye_bot:cadence.moe",
					event_id: "$create",
					origin_server_ts: 0,
					room_id: roomID,
					content: {
						room_version: "11"
					}
				}
			},
			async *generateFullHierarchy(spaceID) {
				called.push("generate full hierarchy")
			},
			async sendState(roomID, type, key, content) {
				called.push("set power levels")
				t.ok(["!hierarchy", "!jjmvBegULiLucuWEHU:cadence.moe"].includes(roomID), `expected room ID to be in hierarchy, but was ${roomID}`)
				t.equal(type, "m.room.power_levels")
				t.equal(key, "")
				t.deepEqual(content, {
					users: {}
				})
				return "$updated"
			}
		}
	}))
	t.equal(msgs.length, 2)
	t.equal(msgs[0].createInteractionResponse.data.content, "Updating `@cadence:cadence.moe` to **default**, please wait...")
	t.equal(msgs[1].editOriginalInteractionResponse.content, "Updated `@cadence:cadence.moe` to **default**.")
	t.deepEqual(called, ["generate full hierarchy", "get room create", "get power levels", "set power levels"])
})
