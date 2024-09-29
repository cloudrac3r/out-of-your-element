const {test} = require("supertape")
const data = require("../../../test/data")
const DiscordTypes = require("discord-api-types/v10")
const {db, discord} = require("../../passthrough")
const {MatrixServerError} = require("../../matrix/mreq")
const {_interact} = require("./reactions")

test("reactions: checks if message is bridged", async t => {
	const msg = await _interact({
		data: {
			target_id: "0"
		}
	}, {})
	t.equal(msg.data.content, "This message hasn't been bridged to Matrix.")
})

test("reactions: different response if nobody reacted", async t => {
	const msg = await _interact({
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
	})
	t.equal(msg.data.content, "Nobody from Matrix reacted to this message.")
})

test("reactions: shows reactions if there are some, ignoring discord users", async t => {
	let called = 1
	const msg = await _interact({
		data: {
			target_id: "1126786462646550579"
		}
	}, {
		api: {
			async getFullRelations(roomID, eventID) {
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
	})
	t.equal(
		msg.data.content,
		"🐈 ⮞ cadence [they] ⬩ @rnl:cadence.moe"
		+ "\n🐈‍⬛ ⮞ cadence [they]"
	)
	t.equal(called, 1)
})
