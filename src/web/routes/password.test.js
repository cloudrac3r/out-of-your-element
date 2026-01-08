// @ts-check

const tryToCatch = require("try-to-catch")
const {test} = require("supertape")
const {router} = require("../../../test/web")

test("web password: stores password", async t => {
	const event = {}
	await router.test("post", "/api/password", {
		body: {
			password: "password123"
		},
		event
	})
	t.equal(event.node.res.statusCode, 302)
})
