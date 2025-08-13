const passthrough = require("../src/passthrough")
const h3 = require("h3")
const http = require("http")
const {SnowTransfer} = require("snowtransfer")
const assert = require("assert").strict
const domino = require("domino")
const {extend} = require("supertape")
const {reg} = require("../src/matrix/read-registration")

const {AppService} = require("@cloudrac3r/in-your-element")
const defaultAs = new AppService(reg)

/**
 * @param {string} html
 */
function getContent(html) {
	const doc = domino.createDocument(html)
	doc.querySelectorAll("svg").cache.forEach(e => e.remove())
	const content = doc.getElementById("content")
	assert(content)
	return content.innerHTML.trim()
}

const test = extend({
	has: operator => /** @param {string | RegExp} expected */ (html, expected, message = "should have substring in html content") => {
		const content = getContent(html)
		const is = expected instanceof RegExp ? content.match(expected) : content.includes(expected)
		const {output, result} = operator.equal(content, expected.toString())
		return {
			expected: expected.toString(),
			message,
			is,
			result: result,
			output: output
		}
	}
})

class Router {
	constructor() {
		/** @type {Map<string, h3.EventHandler>} */
		this.routes = new Map()
		for (const method of ["get", "post", "put", "patch", "delete"]) {
			this[method] = function(url, handler) {
				const key = `${method} ${url}`
				this.routes.set(key, handler)
			}
		}
	}

	/**
	 * @param {string} method
	 * @param {string} inputUrl
	 * @param {{event?: any, params?: any, body?: any, sessionData?: any, api?: Partial<import("../src/matrix/api")>, snow?: {[k in keyof SnowTransfer]?: Partial<SnowTransfer[k]>}, createRoom?: Partial<import("../src/d2m/actions/create-room")>, createSpace?: Partial<import("../src/d2m/actions/create-space")>, headers?: any}} [options]
	 */
	async test(method, inputUrl, options = {}) {
		const url = new URL(inputUrl, "http://a")
		const key = `${method} ${options.route || url.pathname}`
		/* c8 ignore next */
		if (!this.routes.has(key)) throw new Error(`Route not found: "${key}"`)

		const req = {
			method: method.toUpperCase(),
			headers: options.headers || {},
			url
		}
		const event = options.event || {}

		if (typeof options.body === "object" && options.body.constructor === Object) {
			options.body = JSON.stringify(options.body)
			req.headers["content-type"] = "application/json"
		}

		try {
			return await this.routes.get(key)(Object.assign(event, {
				__is_event__: true,
				method: method.toUpperCase(),
				path: `${url.pathname}${url.search}`,
				_requestBody: options.body,
				node: {
					req,
					res: new http.ServerResponse(req)
				},
				context: {
					api: options.api,
					params: options.params,
					snow: options.snow,
					createRoom: options.createRoom,
					createSpace: options.createSpace,
					sessions: {
						h3: {
							id: "h3",
							createdAt: 0,
							data: options.sessionData || {}
						}
					}
				}
			}))
		} catch (error) {
			// Post-process error data
			defaultAs.app.options.onError(error)
			throw error
		}
	}
}

const router = new Router()

passthrough.as = {router, on() {}, options: defaultAs.app.options}

module.exports.router = router
module.exports.test = test
