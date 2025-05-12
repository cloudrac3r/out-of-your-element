// @ts-check

const assert = require("assert/strict")
const tryToCatch = require("try-to-catch")
const {router, test} = require("../../../test/web")

test("web info: 404 when message does not exist", async t => {
	const res = await router.test("get", "/api/message?message_id=1", {
		api: {
			async getEvent(roomID, eventID) {
			}
		}
	})
	t.fail("test not written")
})

test("web info: returns data when message exists", async t => {
	t.fail("test not written")
})
