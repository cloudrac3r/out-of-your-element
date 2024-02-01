const assert = require("assert").strict
const {test} = require("supertape")
const {_convertImageStream} = require("./emoji-sheet")
const fetch = require("node-fetch")
const {Transform} = require("stream").Transform

/* c8 ignore next 7 */
function slow() {
	if (process.argv.includes("--slow")) {
		return test
	} else {
		return test.skip
	}
}

class Meter extends Transform {
	bytes = 0

	_transform(chunk, encoding, cb) {
		this.bytes += chunk.length
		this.push(chunk)
		cb()
	}
}

/**
 * @param {import("supertape").Test} t
 * @param {string} url
 * @param {number} totalSize
 */
async function runSingleTest(t, url, totalSize) {
	const abortController = new AbortController()
	const res = await fetch("https://ezgif.com/images/format-demo/butterfly.png", {agent: false, signal: abortController.signal})
	const meter = new Meter()
	const p = res.body.pipe(meter)
	const result = await _convertImageStream(p, () => {
		abortController.abort()
		res.body.pause()
		res.body.emit("end")
	})
	t.equal(result.subarray(1, 4).toString("ascii"), "PNG", `result was not a PNG file: ${result.toString("base64")}`)
	if (meter.bytes < totalSize / 4) { // should download less than 25% of each file
		t.pass("intentionally read partial file")
	} else {
		t.fail(`read more than 25% of file, read: ${meter.bytes}, total: ${totalSize}`)
	}
}

slow()("emoji-sheet: only partial file is read for APNG", async t => {
	await runSingleTest(t, "https://ezgif.com/images/format-demo/butterfly.png", 2438998)
})

slow()("emoji-sheet: only partial file is read for GIF", async t => {
	await runSingleTest(t, "https://ezgif.com/images/format-demo/butterfly.gif", 781223)
})
