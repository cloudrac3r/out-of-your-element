// @ts-check

const e = new Error("Custom error")

const {test} = require("supertape")
const {eventSenderIsFromDiscord, getEventIDHash, MatrixStringBuilder} = require("./utils")
const util = require("util")

test("sender type: matrix user", t => {
	t.notOk(eventSenderIsFromDiscord("@cadence:cadence.moe"))
})

test("sender type: ooye bot", t => {
	t.ok(eventSenderIsFromDiscord("@_ooye_bot:cadence.moe"))
})

test("sender type: ooye puppet", t => {
	t.ok(eventSenderIsFromDiscord("@_ooye_sheep:cadence.moe"))
})

test("event hash: hash is the same each time", t => {
	const eventID = "$example"
	t.equal(getEventIDHash(eventID), getEventIDHash(eventID))
})

test("event hash: hash is different for different inputs", t => {
	t.notEqual(getEventIDHash("$Ij3qo7NxMA4VPexlAiIx2CB9JbsiGhJeyt-2OvkAUe1"), getEventIDHash("$Ij3qo7NxMA4VPexlAiIx2CB9JbsiGhJeyt-2OvkAUe2"))
})

test("MatrixStringBuilder: add, addLine, add same text", t => {
	const gatewayMessage = {t: "MY_MESSAGE", d: {display: "Custom message data"}}
	let stackLines = e.stack?.split("\n")

	const builder = new MatrixStringBuilder()
	builder.addLine("\u26a0 Bridged event from Discord not delivered", "\u26a0 <strong>Bridged event from Discord not delivered</strong>")
	builder.addLine(`Gateway event: ${gatewayMessage.t}`)
	builder.addLine(e.toString())
	if (stackLines) {
		stackLines = stackLines.slice(0, 2)
		stackLines[1] = stackLines[1].replace(/\\/g, "/").replace(/(\s*at ).*(\/m2d\/)/, "$1.$2")
		builder.addLine(`Error trace:`, `<details><summary>Error trace</summary>`)
		builder.add(`\n${stackLines.join("\n")}`, `<pre>${stackLines.join("\n")}</pre></details>`)
	}
	builder.addLine("", `<details><summary>Original payload</summary><pre>${util.inspect(gatewayMessage.d, false, 4, false)}</pre></details>`)

	t.deepEqual(builder.get(), {
		msgtype: "m.text",
		body: "\u26a0 Bridged event from Discord not delivered"
			+ "\nGateway event: MY_MESSAGE"
			+ "\nError: Custom error"
			+ "\nError trace:"
			+ "\nError: Custom error"
			+ "\n    at ./m2d/converters/utils.test.js:3:11)\n",
		format: "org.matrix.custom.html",
		formatted_body: "\u26a0 <strong>Bridged event from Discord not delivered</strong>"
			+ "<br>Gateway event: MY_MESSAGE"
			+ "<br>Error: Custom error"
			+ "<br><details><summary>Error trace</summary><pre>Error: Custom error\n    at ./m2d/converters/utils.test.js:3:11)</pre></details>"
			+ `<details><summary>Original payload</summary><pre>{ display: 'Custom message data' }</pre></details>`
	})
})

test("MatrixStringBuilder: complete code coverage", t => {
	const builder = new MatrixStringBuilder()
	builder.add("Line 1")
	builder.addParagraph("Line 2")
	builder.add("Line 3")
	builder.addParagraph("Line 4")

	t.deepEqual(builder.get(), {
		msgtype: "m.text",
		body: "Line 1\n\nLine 2Line 3\n\nLine 4",
		format: "org.matrix.custom.html",
		formatted_body: "Line 1<p>Line 2</p>Line 3<p>Line 4</p>"
	})
})
