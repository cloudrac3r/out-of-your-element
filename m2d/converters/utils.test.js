// @ts-check

const {test} = require("supertape")
const {eventSenderIsFromDiscord, getEventIDHash} = require("./utils")

test("sender type: matrix user", t => {
	t.notOk(eventSenderIsFromDiscord("@cadence:cadence.moe"))
})

test("sender type: ooye bot", t => {
	t.ok(eventSenderIsFromDiscord("@_ooye_bot:cadence.moe"))
})

test("sender type: ooye puppet", t => {
	t.ok(eventSenderIsFromDiscord("@_ooye_sheep:cadence.moe"))
})

test("event hash: hash is the same each time", t => {
	const eventID = "$example"
	t.equal(getEventIDHash(eventID), getEventIDHash(eventID))
})

test("event hash: hash is different for different inputs", t => {
	t.notEqual(getEventIDHash("$Ij3qo7NxMA4VPexlAiIx2CB9JbsiGhJeyt-2OvkAUe1"), getEventIDHash("$Ij3qo7NxMA4VPexlAiIx2CB9JbsiGhJeyt-2OvkAUe2"))
})
