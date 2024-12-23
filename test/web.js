const passthrough = require("../src/passthrough")
const h3 = require("h3")
const http = require("http")
const {SnowTransfer} = require("snowtransfer")

class Router {
	constructor() {
		/** @type {Map<string, h3.EventHandler>} */
		this.routes = new Map()
		for (const method of ["get", "post", "put", "patch", "delete"]) {
			this[method] = function(url, handler) {
				const key = `${method} ${url}`
				this.routes.set(`${key}`, handler)
			}
		}
	}

	/**
	 * @param {string} method
	 * @param {string} inputUrl
	 * @param {{event?: any, params?: any, body?: any, sessionData?: any, api?: Partial<import("../src/matrix/api")>, snow?: {[k in keyof SnowTransfer]?: Partial<SnowTransfer[k]>}, headers?: any}} [options]
	 */
	test(method, inputUrl, options = {}) {
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

		return this.routes.get(key)(Object.assign(event, {
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
				sessions: {
					h3: {
						id: "h3",
						createdAt: 0,
						data: options.sessionData || {}
					}
				}
			}
		}))
	}
}

const router = new Router()

passthrough.as = {router}

module.exports.router = router
