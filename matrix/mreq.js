// @ts-check

const fetch = require("node-fetch").default
const mixin = require("@cloudrac3r/mixin-deep")
const stream = require("stream")
const getStream = require("get-stream")

const {reg} = require("./read-registration.js")

const baseUrl = `${reg.ooye.server_origin}/_matrix`

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
	if (body == undefined || Object.is(body.constructor, Object)) {
		body = JSON.stringify(body)
	} else if (body instanceof stream.Readable && reg.ooye.content_length_workaround) {
		body = await getStream.buffer(body)
	}

	const opts = mixin({
		method,
		body,
		headers: {
			Authorization: `Bearer ${reg.as_token}`
		}
	}, extra)

	// console.log(baseUrl + url, opts)
	const res = await fetch(baseUrl + url, opts)
	const root = await res.json()

	if (!res.ok || root.errcode) {
		if (root.error?.includes("Content-Length")) {
			console.error(`OOYE cannot stream uploads to Synapse. Please choose one of these workarounds:`
				+ `\n  * Run an nginx reverse proxy to Synapse, and point registration.yaml's`
				+ `\n    \`server_origin\` to nginx`
				+ `\n  * Set \`content_length_workaround: true\` in registration.yaml (this will`
				+ `\n    halve the speed of bridging d->m files)`)
			throw new Error("Synapse is not accepting stream uploads, see the message above.")
		}
		delete opts.headers.Authorization
		throw new MatrixServerError(root, {baseUrl, url, ...opts})
	}
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
