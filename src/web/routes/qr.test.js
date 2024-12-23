const {test} = require("supertape")
const {router} = require("../../../test/web")
const getStream = require("get-stream")

test("web qr: returns svg", async t => {
	/** @type {Response} */
	const res = await router.test("get", "/qr?data=hello+world", {
		params: {
			server_name: "cadence.moe",
			media_id: "1"
		}
	})
	t.equal(res.status, 200)
	t.equal(res.headers.get("content-type"), "image/svg+xml")
	const content = await getStream(res.body)
	t.match(content, /<svg/)
})
