const {test} = require("supertape")
const {convertImageStream} = require("./emoji-sheet")
const fs = require("fs")
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
 * @param {string} path
 * @param {number} totalSize
 * @param {number => boolean} sizeCheck
 */
async function runSingleTest(t, path, totalSize, sizeCheck) {
	const file = fs.createReadStream(path)
	const meter = new Meter()
	const p = file.pipe(meter)
	const result = await convertImageStream(p, () => {
		file.pause()
		file.emit("end")
	})
	t.equal(result.subarray(1, 4).toString("ascii"), "PNG", `test that this is a PNG file: ${result.toString("base64").slice(0, 100)}`)
	/* c8 ignore next 5 */
	if (sizeCheck(meter.bytes)) {
		t.pass("read the correct amount of the file")
	} else {
		t.fail(`read too much or too little of the file, read: ${meter.bytes}, total: ${totalSize}`)
	}
}

slow()("emoji-sheet: only partial file is read for APNG", async t => {
	await runSingleTest(t, "test/res/butterfly.png", 2438998, n => n < 2438998 / 4) // should download less than 25% of the file
})

slow()("emoji-sheet: only partial file is read for GIF", async t => {
	await runSingleTest(t, "test/res/butterfly.gif", 781223, n => n < 781223 / 4) // should download less than 25% of the file
})

slow()("emoji-sheet: entire file is read for static PNG", async t => {
	await runSingleTest(t, "test/res/RLMgJGfgTPjIQtvvWZsYjhjy.png", 11301, n => n === 11301) // should download entire file
})
