// @ts-check

const fs = require("fs")
const {convertImageStream} = require("../../m2d/converters/emoji-sheet")
const tryToCatch = require("try-to-catch")
const {test} = require("supertape")
const {router} = require("../../../test/web")

test("web download matrix: access denied if not a known attachment", async t => {
	const [error] = await tryToCatch(() =>
		router.test("get", "/download/matrix/:server_name/:media_id", {
			params: {
				server_name: "cadence.moe",
				media_id: "1"
			}
		})
	)
	t.ok(error)
})

test("web download matrix: works if a known attachment", async t => {
	const event = {}
	await router.test("get", "/download/matrix/:server_name/:media_id", {
		params: {
			server_name: "cadence.moe",
			media_id: "KrwlqopRyMxnEBcWDgpJZPxh",
		},
		event,
		api: {
			async getMedia(mxc, init) {
				return new Response("", {status: 200, headers: {"content-type": "image/png"}})
			}
		}
	})
	t.equal(event.node.res.statusCode, 200)
	t.equal(event.node.res.getHeader("content-type"), "image/png")
})

/**
 * MOCK: Gets the emoji from the filesystem and converts to uncompressed PNG data.
 * @param {string} mxc a single mxc:// URL
 * @returns {Promise<Buffer | undefined>} uncompressed PNG data, or undefined if the downloaded emoji is not valid
*/
async function mockGetAndConvertEmoji(mxc) {
	const id = mxc.match(/\/([^./]*)$/)?.[1]
	let s
	if (fs.existsSync(`test/res/${id}.png`)) {
		s = fs.createReadStream(`test/res/${id}.png`)
	} else {
		s = fs.createReadStream(`test/res/${id}.gif`)
	}
	return convertImageStream(s, () => {
		s.pause()
		s.emit("end")
	})
}

test("web sheet: single emoji", async t => {
	const event = {}
	const sheet = await router.test("get", "/download/sheet?e=cadence.moe%2FRLMgJGfgTPjIQtvvWZsYjhjy", {
		event,
		mxcDownloader: mockGetAndConvertEmoji
	})
	t.equal(event.node.res.statusCode, 200)
	t.equal(sheet.subarray(0, 90).toString("base64"), "iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAACXBIWXMAAAPoAAAD6AG1e1JrAAALoklEQVR4nM1ZaVBU2RU+LZSIGnAvFUtcRkSk6abpbkDH")
})

test("web sheet: multiple sources", async t => {
	const event = {}
	const sheet = await router.test("get", "/download/sheet?e=cadence.moe%2FWbYqNlACRuicynBfdnPYtmvc&e=cadence.moe%2FHYcztccFIPgevDvoaWNsEtGJ", {
		event,
		mxcDownloader: mockGetAndConvertEmoji
	})
	t.equal(event.node.res.statusCode, 200)
	t.equal(sheet.subarray(0, 90).toString("base64"), "iVBORw0KGgoAAAANSUhEUgAAAGAAAAAwCAYAAADuFn/PAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAT/klEQVR4nOVcC3CVRZbuS2KAIMpDQt5PQkIScm/uvYRX")
})

test("web sheet: big sheet", async t => {
	const event = {}
	const sheet = await router.test("get", "/download/sheet?e=cadence.moe%2FlHfmJpzgoNyNtYHdAmBHxXix&e=cadence.moe%2FMtRdXixoKjKKOyHJGWLsWLNU&e=cadence.moe%2FHXfFuougamkURPPMflTJRxGc&e=cadence.moe%2FikYKbkhGhMERAuPPbsnQzZiX&e=cadence.moe%2FAYPpqXzVJvZdzMQJGjioIQBZ&e=cadence.moe%2FUVuzvpVUhqjiueMxYXJiFEAj&e=cadence.moe%2FlHfmJpzgoNyNtYHdAmBHxXix&e=cadence.moe%2FMtRdXixoKjKKOyHJGWLsWLNU&e=cadence.moe%2FHXfFuougamkURPPMflTJRxGc&e=cadence.moe%2FikYKbkhGhMERAuPPbsnQzZiX&e=cadence.moe%2FAYPpqXzVJvZdzMQJGjioIQBZ&e=cadence.moe%2FUVuzvpVUhqjiueMxYXJiFEAj", {
		event,
		mxcDownloader: mockGetAndConvertEmoji
	})
	t.equal(event.node.res.statusCode, 200)
	t.equal(sheet.subarray(0, 90).toString("base64"), "iVBORw0KGgoAAAANSUhEUgAAAYAAAABgCAYAAAAU9KWJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAgAElEQVR4nOx9B3hUVdr/KIpKL2nT0pPpLRNQkdXddV1c")
})
