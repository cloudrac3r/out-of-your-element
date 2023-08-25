// @ts-check

const {test} = require("supertape")
const {eventToMessage} = require("./event-to-message")
const data = require("../../test/data")

function sameFirstContentAndWhitespace(t, a, b) {
	const a2 = JSON.stringify(a[0].content)
	const b2 = JSON.stringify(b[0].content)
	t.equal(a2, b2)
}

test("event2message: janky test", t => {
	t.deepEqual(
		eventToMessage({
			content: {
				body: "test",
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
			content: "test",
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
