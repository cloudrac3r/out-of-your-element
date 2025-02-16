// @ts-check

const mixin = require("@cloudrac3r/mixin-deep")
const stream = require("stream")
const streamWeb = require("stream/web")
const getStream = require("get-stream")

const {reg, writeRegistration} = require("./read-registration.js")

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
 * @param {string | object | streamWeb.ReadableStream | stream.Readable} [body]
 * @param {any} [extra]
 */
async function mreq(method, url, body, extra = {}) {
	if (body == undefined || Object.is(body.constructor, Object)) {
		body = JSON.stringify(body)
	} else if (body instanceof stream.Readable && reg.ooye.content_length_workaround) {
		body = await getStream.buffer(body)
	} else if (body instanceof streamWeb.ReadableStream && reg.ooye.content_length_workaround) {
		body = await stream.consumers.buffer(stream.Readable.fromWeb(body))
	}

	/** @type {RequestInit} */
	const opts = mixin({
		method,
		body,
		headers: {
			Authorization: `Bearer ${reg.as_token}`
		},
		...(body && {duplex: "half"}), // https://github.com/octokit/request.js/pull/571/files
	}, extra)
	// console.log(baseUrl + url, opts)
	const res = await fetch(baseUrl + url, opts)
	const root = await res.json()

	if (!res.ok || root.errcode) {
		if (root.error?.includes("Content-Length") && !reg.ooye.content_length_workaround) {
			reg.ooye.content_length_workaround = true
			const root = await mreq(method, url, body, extra)
			console.error("OOYE cannot stream uploads to Synapse. The `content_length_workaround` option"
				+ "\nhas been activated in registration.yaml, which works around the problem, but"
				+ "\nhalves the speed of bridging d->m files. A better way to resolve this problem"
				+ "\nis to run an nginx reverse proxy to Synapse and re-run OOYE setup.")
			writeRegistration(reg)
			return root
		}
		delete opts.headers?.["Authorization"]
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
module.exports.baseUrl = baseUrl
module.exports.mreq = mreq
module.exports.withAccessToken = withAccessToken
