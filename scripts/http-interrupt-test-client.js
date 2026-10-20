// @ts-check

const crypto = require("crypto")
const fs = require("fs")
const assert = require("assert")
const stream = require("stream")
const {scheduler} = require("timers/promises")

;(async () => {
	try {
		const res = await fetch("http://localhost:6694", {
			keepalive: true
		})
		assert(res.body)

		// const data = await res.blob().then(blob => blob.bytes())
		// console.log(data)

		const c = crypto.createCipheriv("aes-256-ctr", Buffer.from("oKInhenybApUF-X4ahfQi0dIql8fyTXDVjfiEZvJquE", "base64url"), Buffer.from("Qt4ZM5g1zDQAAAAAAAAAAA", "base64url"))
		// @ts-ignore - close enough
		// const nodeBody = stream.Readable.fromWeb(res.body)
		console.log(await new Response(res.body.pipeThrough(stream.Transform.toWeb(c))).bytes())


		console.log("all done")
	} catch (e) {
		console.error(e)
	}

	console.log("didn't crash")
})()
