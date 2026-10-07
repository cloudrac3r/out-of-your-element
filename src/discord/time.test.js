// @ts-check

const time = require("./time")
const {test} = require("supertape")

const d = new Date("2026-02-14T14:23:06.000Z")
const seconds = d.getTime() / 1000

test("time: default style", t => {
	t.equal(time.convertDiscordTime(seconds), "14 February 2026 at 2:23 pm (UTC)")
})

test("time: t style", t => {
	t.equal(time.convertDiscordTime(seconds, "t"), "2:23 pm (UTC)")
})

test("time: T style", t => {
	t.equal(time.convertDiscordTime(seconds, "T"), "2:23:06 pm (UTC)")
})

test("time: d style", t => {
	t.equal(time.convertDiscordTime(seconds, "d"), "14 Feb 2026 (UTC)")
})

test("time: D style", t => {
	t.equal(time.convertDiscordTime(seconds, "D"), "14 February 2026 (UTC)")
})

test("time: f style", t => {
	t.equal(time.convertDiscordTime(seconds, "f"), "14 February 2026 at 2:23 pm (UTC)")
})

test("time: F style", t => {
	t.equal(time.convertDiscordTime(seconds, "F"), "Saturday, 14 February 2026 at 2:23 pm (UTC)")
})

test("time: s style", t => {
	t.equal(time.convertDiscordTime(seconds, "s"), "14 Feb 2026, 2:23 pm (UTC)")
})

test("time: S style", t => {
	t.equal(time.convertDiscordTime(seconds, "S"), "14 Feb 2026, 2:23:06 pm (UTC)")
})

test("time: R style", t => {
	// Discord would display this as relative time, but I don't want to do that in a static message.
	t.equal(time.convertDiscordTime(seconds, "R"), "14 February 2026 at 2:23 pm (UTC)")
})
