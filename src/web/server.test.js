// @ts-check

const {test} = require("supertape")
const {router} = require("../../test/web")

require("./server")

test("web server: can get home", async t => {
	t.match(await router.test("get", "/", {}), /Add the bot to your Discord server./)
})

test("web server: can get htmx", async t => {
	t.match(await router.test("get", "/static/htmx.js", {}), /htmx =/)
})

test("web server: can get css", async t => {
	t.match(await router.test("get", "/static/stacks.min.css", {}), /--stacks-/)
})

test("web server: can get icon", async t => {
	const content = await router.test("get", "/icon.png", {})
	t.ok(content instanceof Buffer)
})

test("web server: compresses static resources", async t => {
	const content = await router.test("get", "/static/stacks.min.css", {
		headers: {
			"accept-encoding": "gzip"
		}
	})
	t.ok(content instanceof ReadableStream)
})
