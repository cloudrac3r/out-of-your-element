const {kstateToState, stateToKState, diffKState, kstateStripConditionals} = require("./kstate")
const {test} = require("supertape")

test("kstate strip: strips false conditions", t => {
	t.deepEqual(kstateStripConditionals({
		a: {$if: false, value: 2},
		b: {value: 4}
	}), {
		b: {value: 4}
	})
})

test("kstate strip: keeps true conditions while removing $if", t => {
	t.deepEqual(kstateStripConditionals({
		a: {$if: true, value: 2},
		b: {value: 4}
	}), {
		a: {value: 2},
		b: {value: 4}
	})
})

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
