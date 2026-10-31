// @ts-check

const http = require("http")
const net = require("net")
const h3 = require("h3")
const {test} = require("supertape")
const {tryToCatch} = require("try-to-catch")
const webUtils = require("./web-utils")

const BRIDGE_ORIGIN = "https://bridge.example.org"

/**
 * @param {http.IncomingHttpHeaders} headers
 * @returns {h3.H3Event}
 */
function eventWithHeaders(headers) {
	const req = new http.IncomingMessage(new net.Socket())
	req.headers = headers
	return h3.createEvent(req, new http.ServerResponse(req))
}

test("web utils: rejectCrossSiteRequest rejects foreign origin without sec-fetch-site", async t => {
	const [error] = await tryToCatch(
		webUtils.rejectCrossSiteRequest, eventWithHeaders({
		"origin": "https://evil.example",
	}))
	t.equal(error?.statusCode, 403)
})

test("web utils: rejectCrossSiteRequest allows same-origin request", async t => {
	const [error] = await tryToCatch(webUtils.rejectCrossSiteRequest, eventWithHeaders({
		"sec-fetch-site": "same-origin",
		"origin": BRIDGE_ORIGIN,
	}))
	t.notOk(error)
})

test("web utils: rejectCrossSiteRequest allows request with no browser headers", async t => {
	const [error] = await tryToCatch(webUtils.rejectCrossSiteRequest, eventWithHeaders({}))
	t.notOk(error)
})

test("web utils: rejectCrossSiteRequest trusts sec-fetch-site over mismatching origin", async t => {
	const [error] = await tryToCatch(webUtils.rejectCrossSiteRequest, eventWithHeaders({
		"sec-fetch-site": "same-origin",
		"origin": "https://alias.example.org",
	}))
	t.notOk(error)
})

test("web utils: rejectCrossSiteRequest rejects request from a sibling subdomain", async t => {
	const [error] = await tryToCatch(webUtils.rejectCrossSiteRequest, eventWithHeaders({
		"sec-fetch-site": "same-site",
		"origin": "https://other.example.org",
	}))
	t.equal(error?.statusCode, 403)
})

test("web utils: rejectCrossSiteRequest rejects browser user agent with no sec-fetch-site nor origin", async t => {
	const [error] = await tryToCatch(webUtils.rejectCrossSiteRequest, eventWithHeaders({
		"user-agent": "Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0",
	}))
	t.equal(error?.statusCode, 403)
})

test("web utils: rejectCrossSiteRequest allows non-browser user agent with no sec-fetch-site or origin", async t => {
	const [error] = await tryToCatch(webUtils.rejectCrossSiteRequest, eventWithHeaders({
		"user-agent": "curl/8",
	}))
	t.notOk(error)
})

test("web utils: rejectCrossSiteRequest allows browser user agent with same-origin sec-fetch-site", async t => {
	const [error] = await tryToCatch(webUtils.rejectCrossSiteRequest, eventWithHeaders({
		"user-agent": "Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0",
		"sec-fetch-site": "same-origin",
	}))
	t.notOk(error)
})

test("web utils: rejectCrossSiteRequest allows browser user agent with matching origin", async t => {
	const [error] = await tryToCatch(webUtils.rejectCrossSiteRequest, eventWithHeaders({
		"user-agent": "Mozilla/5.0 (X11; Linux x86_64; rv:153.0) Gecko/20100101 Firefox/153.0",
		"origin": BRIDGE_ORIGIN,
	}))
	t.notOk(error)
})
