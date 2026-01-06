const {test} = require("supertape")
const DiscordTypes = require("discord-api-types/v10")
const {select, db} = require("../../passthrough")
const {_interact, _interactEdit} = require("./permissions")
const {mockGetEffectivePower} = require("../../m2d/converters/utils.test")

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
	let called = 0
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
			async setUserPowerCascade(roomID, mxid, power) {
				called++
				t.equal(roomID, "!jjmvBegULiLucuWEHU:cadence.moe") // space ID
				t.equal(mxid, "@cadence:cadence.moe")
				t.equal(power, 50)
			}
		}
	}))
	t.equal(msgs.length, 2)
	t.equal(msgs[0].createInteractionResponse.data.content, "Updating `@cadence:cadence.moe` to **moderator**, please wait...")
	t.equal(msgs[1].editOriginalInteractionResponse.content, "Updated `@cadence:cadence.moe` to **moderator**.")
	t.equal(called, 1)
})

test("permissions: can update user to default", async t => {
	let called = 0
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
			async setUserPowerCascade(roomID, mxid, power) {
				called++
				t.equal(roomID, "!jjmvBegULiLucuWEHU:cadence.moe") // space ID
				t.equal(mxid, "@cadence:cadence.moe")
				t.equal(power, 0)
			}
		}
	}))
	t.equal(msgs.length, 2)
	t.equal(msgs[0].createInteractionResponse.data.content, "Updating `@cadence:cadence.moe` to **default**, please wait...")
	t.equal(msgs[1].editOriginalInteractionResponse.content, "Updated `@cadence:cadence.moe` to **default**.")
	t.equal(called, 1)
})
