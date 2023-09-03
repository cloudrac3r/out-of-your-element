// @ts-check

const fetch = require("node-fetch").default
const mixin = require("mixin-deep")

const passthrough = require("../passthrough")
const { sync } = passthrough
/** @type {import("./read-registration")} */
const reg = sync.require("./read-registration.js")

const baseUrl = "https://matrix.cadence.moe/_matrix"

class MatrixServerError extends Error {
	constructor(data, opts) {
		super(data.error || data.errcode)
		this.data = data
		/** @type {string} */
		this.errcode = data.errcode
		this.opts = opts
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

	if (!res.ok || root.errcode) throw new MatrixServerError(root, opts)
	return root
}

/**
 * JavaScript doesn't have Racket-like parameters with dynamic scoping, so
 * do NOT do anything else at the same time as this.
 * @template T
 * @param {string} token
 * @param {(...arg: any[]) => Promise<T>} callback
 * @returns {Promise<T>}
 */
async function withAccessToken(token, callback) {
	const prevToken = reg.as_token
	reg.as_token = token
	try {
		return await callback()
	} finally {
		reg.as_token = prevToken
	}
}

module.exports.MatrixServerError = MatrixServerError
module.exports.mreq = mreq
module.exports.withAccessToken = withAccessToken
