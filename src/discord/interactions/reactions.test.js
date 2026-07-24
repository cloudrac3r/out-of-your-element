const {test} = require("supertape")
const {_interact} = require("./reactions")

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

test("reactions: checks if message is bridged", async t => {
	const msgs = await fromAsync(_interact({
		data: {
			target_id: "0"
		}
	}, {}))
	t.equal(msgs.length, 1)
	t.equal(msgs[0].createInteractionResponse.data.content, "This message hasn't been bridged to Matrix.")
})

test("reactions: different response if nobody reacted", async t => {
	const msgs = await fromAsync(_interact({
		data: {
			target_id: "1126786462646550579"
		}
	}, {
		api: {
			async getFullRelations(roomID, eventID) {
				t.equal(roomID, "!kLRqKKUQXcibIMtOpl:cadence.moe")
				t.equal(eventID, "$X16nfVks1wsrhq4E9SSLiqrf2N8KD0erD0scZG7U5xg")
				return []
			}
		}
	}))
	t.equal(msgs.length, 2)
	t.equal(msgs[1].editOriginalInteractionResponse.content, "Nobody from Matrix reacted to this message.")
})

test("reactions: shows reactions if there are some, ignoring discord users", async t => {
	let called = 0
	const msgs = await fromAsync(_interact({
		data: {
			target_id: "1126786462646550579"
		}
	}, {
		api: {
			async getFullRelations(roomID, eventID) {
				called++
				t.equal(roomID, "!kLRqKKUQXcibIMtOpl:cadence.moe")
				t.equal(eventID, "$X16nfVks1wsrhq4E9SSLiqrf2N8KD0erD0scZG7U5xg")
				return [{
					sender: "@cadence:cadence.moe",
					content: {
						"m.relates_to": {
							key: "🐈",
							rel_type: "m.annotation"
						}
					}
				}, {
					sender: "@rnl:cadence.moe",
					content: {
						"m.relates_to": {
							key: "🐈",
							rel_type: "m.annotation"
						}
					}
				}, {
					sender: "@cadence:cadence.moe",
					content: {
						"m.relates_to": {
							key: "🐈‍⬛",
							rel_type: "m.annotation"
						}
					}
				}, {
					sender: "@_ooye_rnl:cadence.moe",
					content: {
						"m.relates_to": {
							key: "🐈",
							rel_type: "m.annotation"
						}
					}
				}]
			}
		}
	}))
	t.equal(msgs.length, 2)
	t.equal(
		msgs[1].editOriginalInteractionResponse.content,
		"🐈 ⮞ cadence [they] ⬩ @rnl:cadence.moe"
		+ "\n🐈‍⬛ ⮞ cadence [they]"
	)
	t.equal(called, 1)
})

test("reactions: combines reactions from multiple events", async t => {
	let called = 0
	const msgs = await fromAsync(_interact({
		data: {
			target_id: "1141501302736695316"
		}
	}, {
		api: {
			async getFullRelations(roomID, eventID) {
				called++
				t.equal(roomID, "!kLRqKKUQXcibIMtOpl:cadence.moe")
				if (eventID === "$mtR8cJqM4fKno1bVsm8F4wUVqSntt2sq6jav1lyavuA") {
					return [{
						sender: "@cadence:cadence.moe",
						content: {
							"m.relates_to": {
								key: "🐈",
								rel_type: "m.annotation"
							}
						}
					}, {
						sender: "@rnl:cadence.moe",
						content: {
							"m.relates_to": {
								key: "🐈",
								rel_type: "m.annotation"
							}
						}
					}]
				} else if (eventID === "$51f4yqHinwnSbPEQ9dCgoyy4qiIJSX0QYYVUnvwyTCI") {
					return [{
						sender: "@cadence:cadence.moe",
						content: {
							"m.relates_to": {
								key: "🐈‍⬛",
								rel_type: "m.annotation"
							}
						}
					}]
				} else {
					t.fail(`tried to read reactions on wrong event ${eventID}`)
				}
			}
		}
	}))
	t.equal(msgs.length, 2)
	t.equal(
		msgs[1].editOriginalInteractionResponse.content,
		"🐈 ⮞ cadence [they] ⬩ @rnl:cadence.moe"
		+ "\n🐈‍⬛ ⮞ cadence [they]"
	)
	t.equal(called, 2)
})
