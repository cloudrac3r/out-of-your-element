const {kstateToState, stateToKState, diffKState, channelToKState, kstateStripConditionals} = require("./create-room")
const {test} = require("supertape")
const testData = require("../../test/data")

test("kstate2state: general", t => {
	t.deepEqual(kstateToState({
		"m.room.name/": {name: "test name"},
		"m.room.member/@cadence:cadence.moe": {membership: "join"}
	}), [
		{
			type: "m.room.name",
			state_key: "",
			content: {
				name: "test name"
			}
		},
		{
			type: "m.room.member",
			state_key: "@cadence:cadence.moe",
			content: {
				membership: "join"
			}
		}
	])
})

test("state2kstate: general", t => {
	t.deepEqual(stateToKState([
		{
			type: "m.room.name",
			state_key: "",
			content: {
				name: "test name"
			}
		},
		{
			type: "m.room.member",
			state_key: "@cadence:cadence.moe",
			content: {
				membership: "join"
			}
		}
	]), {
		"m.room.name/": {name: "test name"},
		"m.room.member/@cadence:cadence.moe": {membership: "join"}
	})
})

test("diffKState: detects edits", t => {
	t.deepEqual(
		diffKState({
			"m.room.name/": {name: "test name"},
			"same/": {a: 2}
		}, {
			"m.room.name/": {name: "edited name"},
			"same/": {a: 2}
		}),
		{
			"m.room.name/": {name: "edited name"}
		}
	)
})

test("diffKState: detects new properties", t => {
	t.deepEqual(
		diffKState({
			"m.room.name/": {name: "test name"},
		}, {
			"m.room.name/": {name: "test name"},
			"new/": {a: 2}
		}),
		{
			"new/": {a: 2}
		}
	)
})

test("channel2room: general", async t => {
	t.deepEqual(
		kstateStripConditionals(await channelToKState(testData.channel.general, testData.guild.general).then(x => x.channelKState)),
		testData.room.general
	)
})
