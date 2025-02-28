// @ts-check

const stream = require("stream")
const streamWeb = require("stream/web")
const {buffer} = require("stream/consumers")
const mixin = require("@cloudrac3r/mixin-deep")

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
 * @param {undefined | string | object | streamWeb.ReadableStream | stream.Readable} body
 * @returns {Promise<string | streamWeb.ReadableStream | stream.Readable | Buffer>}
 */
async function _convertBody(body) {
	if (body == undefined || Object.is(body.constructor, Object)) {
		return JSON.stringify(body) // almost every POST request is going to follow this one
	} else if (body instanceof stream.Readable && reg.ooye.content_length_workaround) {
		return await buffer(body) // content length workaround is set, so convert to buffer. the buffer consumer accepts node streams.
	} else if (body instanceof stream.Readable) {
		return stream.Readable.toWeb(body) // native fetch can only consume web streams
	} else if (body instanceof streamWeb.ReadableStream && reg.ooye.content_length_workaround) {
		return await buffer(body) // content lenght workaround is set, so convert to buffer. the buffer consumer accepts async iterables, which web streams are.
	}
	return body
}

/* c8 ignore start */

/**
 * @param {string} method
 * @param {string} url
 * @param {string | object | streamWeb.ReadableStream | stream.Readable} [bodyIn]
 * @param {any} [extra]
 */
async function mreq(method, url, bodyIn, extra = {}) {
	const body = await _convertBody(bodyIn)

	/** @type {RequestInit} */
	const opts = mixin({
		method,
		body,
		headers: {
			Authorization: `Bearer ${reg.as_token}`
		},
		...(body && {duplex: "half"}), // https://github.com/octokit/request.js/pull/571/files
	}, extra)

	const res = await fetch(baseUrl + url, opts)
	const root = await res.json()

	if (!res.ok || root.errcode) {
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
module.exports._convertBody = _convertBody
