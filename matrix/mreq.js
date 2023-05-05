// @ts-check

const fetch = require("node-fetch").default
const mixin = require("mixin-deep")

const passthrough = require("../passthrough")
const { sync } = passthrough
/** @type {import("./read-registration")} */
const reg = sync.require("./read-registration.js")

const baseUrl = "https://matrix.cadence.moe/_matrix"

class MatrixServerError extends Error {
	constructor(data) {
		super(data.error || data.errcode)
		this.data = data
		/** @type {string} */
		this.errcode = data.errcode
		/** @type {string} */
		this.error = data.error
	}
}

/**
 * @param {string} method
 * @param {string} url
 * @param {any} [body]
 * @param {any} [extra]
 */
async function mreq(method, url, body, extra = {}) {
	const opts = mixin({
		method,
		body: (body == undefined || Object.is(body.constructor, Object)) ? JSON.stringify(body) : body,
		headers: {
			Authorization: `Bearer ${reg.as_token}`
		}
	}, extra)

	// console.log(baseUrl + url, opts)
	const res = await fetch(baseUrl + url, opts)
	const root = await res.json()

	if (!res.ok || root.errcode) throw new MatrixServerError(root)
	return root
}

module.exports.MatrixServerError = MatrixServerError
module.exports.mreq = mreq
