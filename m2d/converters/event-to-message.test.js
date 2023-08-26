// @ts-check

const {test} = require("supertape")
const {eventToMessage} = require("./event-to-message")
const data = require("../../test/data")

function sameFirstContentAndWhitespace(t, a, b) {
	const a2 = JSON.stringify(a[0].content)
	const b2 = JSON.stringify(b[0].content)
	t.equal(a2, b2)
}

test("event2message: body is used when there is no formatted_body", t => {
	t.deepEqual(
		eventToMessage({
			content: {
				body: "testing plaintext",
				msgtype: "m.text"
			},
			event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOU",
			origin_server_ts: 1688301929913,
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
			sender: "@cadence:cadence.moe",
			type: "m.room.message",
			unsigned: {
				age: 405299
			}
		}),
		[{
			username: "cadence",
			content: "testing plaintext",
			avatar_url: undefined
		}]
	)
})

test("event2message: any markdown in body is escaped", t => {
	t.deepEqual(
		eventToMessage({
			content: {
				body: "testing **special** ~~things~~ which _should_ *not* `trigger` @any <effects>",
				msgtype: "m.text"
			},
			event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOU",
			origin_server_ts: 1688301929913,
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
			sender: "@cadence:cadence.moe",
			type: "m.room.message",
			unsigned: {
				age: 405299
			}
		}),
		[{
			username: "cadence",
			content: "testing \\*\\*special\\*\\* \\~\\~things\\~\\~ which \\_should\\_ \\*not\\* \\`trigger\\` @any <effects>",
			avatar_url: undefined
		}]
	)
})

test("event2message: basic html is converted to markdown", t => {
	t.deepEqual(
		eventToMessage({
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: "this <strong>is</strong> a <strong><em>test</em></strong> of <del>formatting</del>"
			},
			event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOU",
			origin_server_ts: 1688301929913,
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
			sender: "@cadence:cadence.moe",
			type: "m.room.message",
			unsigned: {
				age: 405299
			}
		}),
		[{
			username: "cadence",
			content: "this **is** a **_test_** of ~~formatting~~",
			avatar_url: undefined
		}]
	)
})

test("event2message: markdown syntax is escaped", t => {
	t.deepEqual(
		eventToMessage({
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: "this **is** an <strong><em>extreme</em></strong> \\*test\\* of"
			},
			event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOU",
			origin_server_ts: 1688301929913,
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
			sender: "@cadence:cadence.moe",
			type: "m.room.message",
			unsigned: {
				age: 405299
			}
		}),
		[{
			username: "cadence",
			content: "this \\*\\*is\\*\\* an **_extreme_** \\\\\\*test\\\\\\* of",
			avatar_url: undefined
		}]
	)
})

test("event2message: html lines are bridged correctly", t => {
	t.deepEqual(
		eventToMessage({
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: "<p>paragraph one<br>line <em>two</em><br>line three<br><br>paragraph two\nline <em>two</em>\nline three\n\nparagraph three</p><p>paragraph four\nline two<br>line three\nline four</p>paragraph five"
			},
			event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOU",
			origin_server_ts: 1688301929913,
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
			sender: "@cadence:cadence.moe",
			type: "m.room.message",
			unsigned: {
				age: 405299
			}
		}),
		[{
			username: "cadence",
			content: "paragraph one\nline _two_\nline three\n\nparagraph two\nline _two_\nline three\n\nparagraph three\n\nparagraph four\nline two\nline three\nline four\n\nparagraph five",
			avatar_url: undefined
		}]
	)
})

/*test("event2message: whitespace is retained", t => {
	t.deepEqual(
		eventToMessage({
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: "line one: test       test<br>line two: <strong>test</strong>       <strong>test</strong><br>line three: <strong>test       test</strong><br>line four: test<strong>       </strong>test<br>       line five"
			},
			event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOU",
			origin_server_ts: 1688301929913,
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
			sender: "@cadence:cadence.moe",
			type: "m.room.message",
			unsigned: {
				age: 405299
			}
		}),
		[{
			username: "cadence",
			content: "line one: test       test\nline two: **test**       **test**\nline three: **test       test**\nline four: test       test\n       line five",
			avatar_url: undefined
		}]
	)
})*/

test("event2message: whitespace is collapsed", t => {
	sameFirstContentAndWhitespace(
		t,
		eventToMessage({
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: "line one: test       test<br>line two: <strong>test</strong>       <strong>test</strong><br>line three: <strong>test       test</strong><br>line four: test<strong>       </strong>test<br>       line five"
			},
			event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOU",
			origin_server_ts: 1688301929913,
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
			sender: "@cadence:cadence.moe",
			type: "m.room.message",
			unsigned: {
				age: 405299
			}
		}),
		[{
			username: "cadence",
			content: "line one: test test\nline two: **test** **test**\nline three: **test test**\nline four: test test\nline five",
			avatar_url: undefined
		}]
	)
})

test("event2message: lists are bridged correctly", t => {
	sameFirstContentAndWhitespace(
		t,
		eventToMessage({
			"type": "m.room.message",
			"sender": "@cadence:cadence.moe",
			"content": {
				"msgtype": "m.text",
				"body": "* line one\n* line two\n* line three\n  * nested one\n  * nested two\n* line four",
				"format": "org.matrix.custom.html",
				"formatted_body": "<ul>\n<li>line one</li>\n<li>line two</li>\n<li>line three\n<ul>\n<li>nested one</li>\n<li>nested two</li>\n</ul>\n</li>\n<li>line four</li>\n</ul>\n"
			},
			"origin_server_ts": 1692967314062,
			"unsigned": {
				"age": 112,
				"transaction_id": "m1692967313951.441"
			},
			"event_id": "$l-xQPY5vNJo3SNxU9d8aOWNVD1glMslMyrp4M_JEF70",
			"room_id": "!BpMdOUkWWhFxmTrENV:cadence.moe"
		}),
		[{
			username: "cadence",
			content: "*   line one\n*   line two\n*   line three\n    *   nested one\n    *   nested two\n*   line four",
			avatar_url: undefined
		}]
	)
})

test("event2message: long messages are split", t => {
	t.deepEqual(
		eventToMessage({
			content: {
				body: ("a".repeat(130) + " ").repeat(19),
				msgtype: "m.text"
			},
			event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOU",
			origin_server_ts: 1688301929913,
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
			sender: "@cadence:cadence.moe",
			type: "m.room.message",
			unsigned: {
				age: 405299
			}
		}),
		[{
			username: "cadence",
			content: (("a".repeat(130) + " ").repeat(15)).slice(0, -1),
			avatar_url: undefined
		}, {
			username: "cadence",
			content: (("a".repeat(130) + " ").repeat(4)).slice(0, -1),
			avatar_url: undefined
		}]
	)
})

test("event2message: code blocks work", t => {
	t.deepEqual(
		eventToMessage({
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: "<p>preceding</p>\n<pre><code>code block\n</code></pre>\n<p>following <code>code</code> is inline</p>\n"
			},
			event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOU",
			origin_server_ts: 1688301929913,
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
			sender: "@cadence:cadence.moe",
			type: "m.room.message",
			unsigned: {
				age: 405299
			}
		}),
		[{
			username: "cadence",
			content: "preceding\n\n```\ncode block\n```\n\nfollowing `code` is inline",
			avatar_url: undefined
		}]
	)
})

test("event2message: code block contents are formatted correctly and not escaped", t => {
	t.deepEqual(
		eventToMessage({
			"type": "m.room.message",
			"sender": "@cadence:cadence.moe",
			"content": {
				"msgtype": "m.text",
				"body": "wrong body",
				"format": "org.matrix.custom.html",
				"formatted_body": "<pre><code>input = input.replace(/(&lt;\\/?([^ &gt;]+)[^&gt;]*&gt;)?\\n(&lt;\\/?([^ &gt;]+)[^&gt;]*&gt;)?/g,\n_input_ = input = input.replace(/(&lt;\\/?([^ &gt;]+)[^&gt;]*&gt;)?\\n(&lt;\\/?([^ &gt;]+)[^&gt;]*&gt;)?/g,\n</code></pre>\n<p><code>input = input.replace(/(&lt;\\/?([^ &gt;]+)[^&gt;]*&gt;)?\\n(&lt;\\/?([^ &gt;]+)[^&gt;]*&gt;)?/g,</code></p>\n"
			},
			"origin_server_ts": 1693031482275,
			"unsigned": {
				"age": 99,
				"transaction_id": "m1693031482146.511"
			},
			"event_id": "$pGkWQuGVmrPNByrFELxhzI6MCBgJecr5I2J3z88Gc2s",
			"room_id": "!BpMdOUkWWhFxmTrENV:cadence.moe"
		}),
		[{
			username: "cadence",
			content: "```\ninput = input.replace(/(<\\/?([^ >]+)[^>]*>)?\\n(<\\/?([^ >]+)[^>]*>)?/g,\n_input_ = input = input.replace(/(<\\/?([^ >]+)[^>]*>)?\\n(<\\/?([^ >]+)[^>]*>)?/g,\n```\n\n`input = input.replace(/(<\\/?([^ >]+)[^>]*>)?\\n(<\\/?([^ >]+)[^>]*>)?/g,`",
			avatar_url: undefined
		}]
	)
})

test("event2message: quotes have an appropriate amount of whitespace", t => {
	t.deepEqual(
		eventToMessage({
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: "<blockquote>Chancellor of Germany Angela Merkel, on March 17, 2017: they did not shake hands<br><br><br></blockquote><br>🤨"
			},
			event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOU",
			origin_server_ts: 1688301929913,
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
			sender: "@cadence:cadence.moe",
			type: "m.room.message",
			unsigned: {
				age: 405299
			}
		}),
		[{
			username: "cadence",
			content: "> Chancellor of Germany Angela Merkel, on March 17, 2017: they did not shake hands\n🤨",
			avatar_url: undefined
		}]
	)
})

test("event2message: m.emote markdown syntax is escaped", t => {
	t.deepEqual(
		eventToMessage({
			content: {
				msgtype: "m.emote",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: "shows you **her** <strong><em>extreme</em></strong> \\*test\\* of"
			},
			event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOU",
			origin_server_ts: 1688301929913,
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
			sender: "@cadence:cadence.moe",
			type: "m.room.message",
			unsigned: {
				age: 405299
			}
		}),
		[{
			username: "cadence",
			content: "\\* cadence shows you \\*\\*her\\*\\* **_extreme_** \\\\\\*test\\\\\\* of",
			avatar_url: undefined
		}]
	)
})
