// @ts-check

const streamWeb = require("stream/web")
const {test} = require("../../test/web")
const {router} = require("../../test/web")
const {tryToCatch} = require("try-to-catch")
const assert = require("assert").strict

require("./server")

test("web server: can get home", async t => {
	t.has(await router.test("get", "/", {}), /a bridge between the Discord and Matrix chat apps/)
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
	assert(content instanceof streamWeb.ReadableStream)
	const firstChunk = await content.getReader().read()
	t.ok(firstChunk.value instanceof Uint8Array, "can get data")
	t.deepEqual(firstChunk.value.slice(0, 3), Uint8Array.from([31, 139, 8]), "has compressed gzip header")
})

// CSRF prevention

test("web server: all POST routes reject cross-site requests", async t => {
	const postRoutes = [...router.routes.keys()]
		.filter((key) => key.startsWith("post "))
		.map((key) => key.slice(5));

	t.ok(postRoutes.length >= 1, "found no POST routes to check")

	const notRejected = []
	for (const route of postRoutes) {
		const [error] = await tryToCatch(() => router.test("post", route, {
			headers: {
				"sec-fetch-site": "cross-site",
				"origin": "https://evil.example",
			},
			body: {},
			params: {}
		}))
		if (error?.statusCode !== 403) notRejected.push(`${route} (${error?.statusCode ?? "no error"})`)
	}
	t.deepEqual(notRejected, [])
})

test("web server: router allows a cross-site GET request", async t => {
	const html = await router.test("get", "/", {
		headers: {
			"sec-fetch-site": "cross-site",
			"origin": "https://evil.example",
		}
	})
	t.ok(html)
})
