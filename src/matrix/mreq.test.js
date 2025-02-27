// @ts-check

const assert = require("assert")
const stream = require("stream")
const streamWeb = require("stream/web")
const {buffer} = require("stream/consumers")
const {test} = require("supertape")
const {_convertBody} = require("./mreq")
const {reg} = require("./read-registration")

async function *generator() {
	yield "a"
	yield "b"
}

reg.ooye.content_length_workaround = false

test("convert body: converts object to string", async t => {
	t.equal(await _convertBody({a: "1"}), `{"a":"1"}`)
})

test("convert body: leaves undefined as undefined", async t => {
	t.equal(await _convertBody(undefined), undefined)
})

test("convert body: leaves web readable as web readable", async t => {
	const webReadable = stream.Readable.toWeb(stream.Readable.from(generator()))
	t.equal(await _convertBody(webReadable), webReadable)
})

test("convert body: converts node readable to web readable (for native fetch upload)", async t => {
	const readable = stream.Readable.from(generator())
	const webReadable = await _convertBody(readable)
	assert(webReadable instanceof streamWeb.ReadableStream)
	t.deepEqual(await buffer(webReadable), Buffer.from("ab"))
})

test("convert body: converts node readable to buffer", async t => {
	reg.ooye.content_length_workaround = true
	const readable = stream.Readable.from(generator())
	t.deepEqual(await _convertBody(readable), Buffer.from("ab"))
})

test("convert body: converts web readable to buffer", async t => {
	const webReadable = stream.Readable.toWeb(stream.Readable.from(generator()))
	t.deepEqual(await _convertBody(webReadable), Buffer.from("ab"))
})
