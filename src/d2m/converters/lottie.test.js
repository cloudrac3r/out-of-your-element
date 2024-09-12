// @ts-check

const fs = require("fs")
const stream = require("stream")
const {test} = require("supertape")
const {convert} = require("./lottie")

const WRITE_PNG = false

test("lottie: can convert and save PNG", async t => {
	const input = await fs.promises.readFile("test/res/lottie-bee.json", "utf8")
	const resultStream = await convert(input)
	/* c8 ignore next 3 */
	if (WRITE_PNG) {
		resultStream.pipe(fs.createWriteStream("test/res/lottie-bee.png"))
		t.fail("PNG written to /test/res/lottie-bee.png, please manually check it")
	} else {
		const expected = await fs.promises.readFile("test/res/lottie-bee.png")
		const actual = Buffer.alloc(expected.length)
		let i = 0
		await stream.promises.pipeline(
			resultStream,
			async function* (source) {
				for await (const chunk of source) {
					chunk.copy(actual, i)
					i += chunk.length
				}
			},
			new stream.PassThrough()
		)
		t.equal(i, actual.length, `allocated ${actual.length} bytes, but wrote ${i}`)
		t.deepEqual(actual, expected)
	}
})
