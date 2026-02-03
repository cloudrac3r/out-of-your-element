// @ts-check

const {test} = require("supertape")
const {scoreLocalpart, scoreName, tokenise} = require("./find-mentions")

test("score localpart: score against cadence", t => {
	const localparts = [
		"cadence",
		"cadence_test",
		"roblkyogre",
		"cat",
		"arcade_cabinet"
	]
	t.deepEqual(localparts.map(l => scoreLocalpart(l, "cadence").score), [
		15.5,
		14,
		0,
		4,
		4
	])
})

test("score mxid: tiebreak multiple perfect matches on name length", t => {
	const users = [
		{displayname: "Emma [it/its] ⚡️", localpart: "emma"},
		{displayname: "Emma [it/its]", localpart: "emma"}
	]
	const results = users.map(u => scoreLocalpart(u.localpart, "emma", u.displayname).score)
	t.ok(results[0] < results[1], `comparison: ${results.join(" < ")}`)
})

test("score name: score against cadence", t => {
	const names = [
		"bgt lover",
		"Ash 🦑 (xey/it)",
		"Cadence, Maid of Creation, Eye of Clarity, Empress of Hope ☆",
		"underscore_idiot #sunshine",
		"INX | Evil Lillith (she/her)",
		"INX | Lillith (she/her)",
		"🌟luna🌟",
		"#1 Ritsuko Kinnie"
	]
	t.deepEqual(names.map(n => scoreName(tokenise(n), tokenise("cadence")).score), [
		0,
		0,
		14,
		0,
		0,
		0,
		0,
		0
	])
})

test("score name: nothing scored after a token doesn't match", t => {
	const names = [
		"bgt lover",
		"Ash 🦑 (xey/it)",
		"Cadence, Maid of Creation, Eye of Clarity, Empress of Hope ☆",
		"underscore_idiot #sunshine",
		"INX | Evil Lillith (she/her)",
		"INX | Lillith (she/her)",
		"🌟luna🌟",
		"#1 Ritsuko Kinnie"
	]
	t.deepEqual(names.map(n => scoreName(tokenise(n), tokenise("I hope so")).score), [
		0,
		0,
		0,
		0,
		0,
		0,
		0,
		0
	])
})

test("score name: prefers earlier match", t => {
	const names = [
		"INX | Lillith (she/her)",
		"INX | Evil Lillith (she/her)"
	]
	const results = names.map(n => scoreName(tokenise(n), tokenise("lillith")).score)
	t.ok(results[0] > results[1], `comparison: ${results.join(" > ")}`)
})

test("score name: matches lots of tokens", t => {
	t.deepEqual(
		Math.round(scoreName(tokenise("Cadence, Maid of Creation, Eye of Clarity, Empress of Hope ☆"), tokenise("cadence maid of creation eye of clarity empress of hope")).score),
		50
	)
})

test("score name: prefers variation when you specify it", t => {
	const names = [
		"Cadence (test account)",
		"Cadence"
	]
	const results = names.map(n => scoreName(tokenise(n), tokenise("cadence test")).score)
	t.ok(results[0] > results[1], `comparison: ${results.join(" > ")}`)
})

test("score name: prefers original when not specified", t => {
	const names = [
		"Cadence (test account)",
		"Cadence"
	]
	const results = names.map(n => scoreName(tokenise(n), tokenise("cadence")).score)
	t.ok(results[0] < results[1], `comparison: ${results.join(" < ")}`)
})

test("score name: finds match location", t => {
	const message = "evil lillith is an inspiration"
	const result = scoreName(tokenise("INX | Evil Lillith (she/her)"), tokenise(message))
	const startLocation = result.matchedInputTokens[0].index
	const endLocation = result.matchedInputTokens.at(-1).end
	t.equal(message.slice(startLocation, endLocation), "evil lillith")
})
