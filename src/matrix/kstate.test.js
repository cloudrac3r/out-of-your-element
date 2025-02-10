const assert = require("assert")
const {kstateToState, stateToKState, diffKState, kstateStripConditionals, kstateUploadMxc} = require("./kstate")
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

test("kstateUploadMxc: sets the mxc", async t => {
	const input = {
		"m.room.avatar/": {
			url: {$url: "https://cdn.discordapp.com/guilds/112760669178241024/users/134826546694193153/avatars/38dd359aa12bcd52dd3164126c587f8c.png?size=1024"},
			test1: {
				test2: {
					test3: {$url: "https://cdn.discordapp.com/attachments/176333891320283136/1157854643037163610/Screenshot_20231001_034036.jpg"}
				}
			}
		}
	}
	await kstateUploadMxc(input)
	t.deepEqual(input, {
		"m.room.avatar/": {
			url: "mxc://cadence.moe/rfemHmAtcprjLEiPiEuzPhpl",
			test1: {
				test2: {
					test3: "mxc://cadence.moe/zAXdQriaJuLZohDDmacwWWDR"
				}
			}
		}
	})
})

test("kstateUploadMxc and strip: work together", async t => {
	const input = {
		"m.room.avatar/yes": {
			$if: true,
			url: {$url: "https://cdn.discordapp.com/guilds/112760669178241024/users/134826546694193153/avatars/38dd359aa12bcd52dd3164126c587f8c.png?size=1024"}
		},
		"m.room.avatar/no": {
			$if: false,
			url: {$url: "https://cdn.discordapp.com/avatars/320067006521147393/5fc4ad85c1ea876709e9a7d3374a78a1.png?size=1024"}
		},
	}
	kstateStripConditionals(input)
	await kstateUploadMxc(input)
	t.deepEqual(input, {
		"m.room.avatar/yes": {
			url: "mxc://cadence.moe/rfemHmAtcprjLEiPiEuzPhpl"
		}
	})
})


test("kstate2state: general", async t => {
	t.deepEqual(await kstateToState({
		"m.room.name/": {name: "test name"},
		"m.room.member/@cadence:cadence.moe": {membership: "join"},
		"uk.half-shot.bridge/org.matrix.appservice-irc://irc/epicord.net/#general": {creator: "@cadence:cadence.moe"}
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
		},
		{
			type: "uk.half-shot.bridge",
			state_key: "org.matrix.appservice-irc://irc/epicord.net/#general",
			content: {
				creator: "@cadence:cadence.moe"
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
		},
		{
			type: "uk.half-shot.bridge",
			state_key: "org.matrix.appservice-irc://irc/epicord.net/#general",
			content: {
				creator: "@cadence:cadence.moe"
			}
		}
	]), {
		"m.room.name/": {name: "test name"},
		"m.room.member/@cadence:cadence.moe": {membership: "join"},
		"uk.half-shot.bridge/org.matrix.appservice-irc://irc/epicord.net/#general": {creator: "@cadence:cadence.moe"}
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

test("diffKState: power levels are mixed together", t => {
	const original = {
		"m.room.power_levels/": {
			"ban": 50,
			"events": {
				"m.room.name": 100,
				"m.room.power_levels": 100
			},
			"events_default": 0,
			"invite": 50,
			"kick": 50,
			"notifications": {
				"room": 20
			},
			"redact": 50,
			"state_default": 50,
			"users": {
				"@example:localhost": 100
			},
			"users_default": 0
		}
	}
	const result = diffKState(original, {
		"m.room.power_levels/": {
			"events": {
				"m.room.avatar": 0
			}
		}
	})
	t.deepEqual(result, {
		"m.room.power_levels/": {
			"ban": 50,
			"events": {
				"m.room.name": 100,
				"m.room.power_levels": 100,
				"m.room.avatar": 0
			},
			"events_default": 0,
			"invite": 50,
			"kick": 50,
			"notifications": {
				"room": 20
			},
			"redact": 50,
			"state_default": 50,
			"users": {
				"@example:localhost": 100
			},
			"users_default": 0
		}
	})
	t.notDeepEqual(original, result)
})

test("diffKState: cannot merge power levels if original power levels are missing", t => {
	const original = {}
	assert.throws(() =>
		diffKState(original, {
			"m.room.power_levels/": {
				"events": {
					"m.room.avatar": 0
				}
			}
		})
	, /original power level data is missing/)
	t.pass()
})

test("diffKState: kstate keys must contain a slash separator", t => {
	assert.throws(() =>
		diffKState({
			"m.room.name/": {name: "test name"},
		}, {
			"m.room.name/": {name: "test name"},
			"new": {a: 2}
		})
	, /does not contain a slash separator/)
	t.pass()
})

test("diffKState: don't add hide_ui when not present", t => {
	test("diffKState: detects new properties", t => {
		t.deepEqual(
			diffKState({
			}, {
				"chat.schildi.hide_ui/read_receipts/": {}
			}),
			{
			}
		)
	})
})

test("diffKState: overwriten hide_ui when present", t => {
	test("diffKState: detects new properties", t => {
		t.deepEqual(
			diffKState({
				"chat.schildi.hide_ui/read_receipts/": {hidden: true}
			}, {
				"chat.schildi.hide_ui/read_receipts/": {}
			}),
			{
				"chat.schildi.hide_ui/read_receipts/": {}
			}
		)
	})
})
