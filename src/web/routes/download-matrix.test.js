// @ts-check

const tryToCatch = require("try-to-catch")
const {test} = require("supertape")
const {router} = require("../../../test/web")

test("web download matrix: access denied if not a known attachment", async t => {
	const [error] = await tryToCatch(() =>
		router.test("get", "/download/matrix/:server_name/:media_id", {
			params: {
				server_name: "cadence.moe",
				media_id: "1"
			}
		})
	)
	t.ok(error)
})

test("web download matrix: works if a known attachment", async t => {
	const event = {}
	await router.test("get", "/download/matrix/:server_name/:media_id", {
		params: {
			server_name: "cadence.moe",
			media_id: "KrwlqopRyMxnEBcWDgpJZPxh",
		},
		event,
		api: {
			async getMedia(mxc, init) {
				return new Response("", {status: 200, headers: {"content-type": "image/png"}})
			}
		}
	})
	t.equal(event.node.res.statusCode, 200)
	t.equal(event.node.res.getHeader("content-type"), "image/png")
})
