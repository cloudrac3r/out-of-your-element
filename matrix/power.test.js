// @ts-check

const {test} = require("supertape")
const power = require("./power")

test("power: get affected rooms", t => {
	t.deepEqual(power._getAffectedRooms(), [{
		mxid: "@test_auto_invite:example.org",
		power_level: 100,
		room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
	}])
})
