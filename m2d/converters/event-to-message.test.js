const {test} = require("supertape")
const {eventToMessage} = require("./event-to-message")
const data = require("../../test/data")

/**
 * @param {string} roomID
 * @param {string} eventID
 * @returns {(roomID: string, eventID: string) => Promise<Ty.Event.Outer<Ty.Event.M_Room_Message>>}
 */
function mockGetEvent(t, roomID_in, eventID_in, outer) {
	return async function(roomID, eventID) {
		t.equal(roomID, roomID_in)
		t.equal(eventID, eventID_in)
		return new Promise(resolve => {
			setTimeout(() => {
				resolve({
					event_id: eventID_in,
					room_id: roomID_in,
					origin_server_ts: 1680000000000,
					unsigned: {
						age: 2245,
						transaction_id: "$local.whatever"
					},
					...outer
				})
			})
		})
	}
}

function sameFirstContentAndWhitespace(t, a, b) {
	const a2 = JSON.stringify(a[0].content)
	const b2 = JSON.stringify(b[0].content)
	t.equal(a2, b2)
}

test("event2message: body is used when there is no formatted_body", async t => {
	t.deepEqual(
		await eventToMessage({
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
			username: "cadence [they]",
			content: "testing plaintext",
			avatar_url: undefined
		}]
	)
})

test("event2message: any markdown in body is escaped", async t => {
	t.deepEqual(
		await eventToMessage({
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
			username: "cadence [they]",
			content: "testing \\*\\*special\\*\\* \\~\\~things\\~\\~ which \\_should\\_ \\*not\\* \\`trigger\\` @any <effects>",
			avatar_url: undefined
		}]
	)
})

test("event2message: basic html is converted to markdown", async t => {
	t.deepEqual(
		await eventToMessage({
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
			username: "cadence [they]",
			content: "this **is** a **_test_** of ~~formatting~~",
			avatar_url: undefined
		}]
	)
})

test("event2message: markdown syntax is escaped", async t => {
	t.deepEqual(
		await eventToMessage({
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
			username: "cadence [they]",
			content: "this \\*\\*is\\*\\* an **_extreme_** \\\\\\*test\\\\\\* of",
			avatar_url: undefined
		}]
	)
})

test("event2message: html lines are bridged correctly", async t => {
	t.deepEqual(
		await eventToMessage({
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
			username: "cadence [they]",
			content: "paragraph one\nline _two_\nline three\n\nparagraph two\nline _two_\nline three\n\nparagraph three\n\nparagraph four\nline two\nline three\nline four\n\nparagraph five",
			avatar_url: undefined
		}]
	)
})

/*test("event2message: whitespace is retained", async t => {
	t.deepEqual(
		await eventToMessage({
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
			username: "cadence [they]",
			content: "line one: test       test\nline two: **test**       **test**\nline three: **test       test**\nline four: test       test\n       line five",
			avatar_url: undefined
		}]
	)
})*/

test("event2message: whitespace is collapsed", async t => {
	sameFirstContentAndWhitespace(
		t,
		await eventToMessage({
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
			username: "cadence [they]",
			content: "line one: test test\nline two: **test** **test**\nline three: **test test**\nline four: test test\nline five",
			avatar_url: undefined
		}]
	)
})

test("event2message: lists are bridged correctly", async t => {
	sameFirstContentAndWhitespace(
		t,
		await eventToMessage({
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
			username: "cadence [they]",
			content: "*   line one\n*   line two\n*   line three\n    *   nested one\n    *   nested two\n*   line four",
			avatar_url: undefined
		}]
	)
})

test("event2message: long messages are split", async t => {
	t.deepEqual(
		await eventToMessage({
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
			username: "cadence [they]",
			content: (("a".repeat(130) + " ").repeat(15)).slice(0, -1),
			avatar_url: undefined
		}, {
			username: "cadence [they]",
			content: (("a".repeat(130) + " ").repeat(4)).slice(0, -1),
			avatar_url: undefined
		}]
	)
})

test("event2message: code blocks work", async t => {
	t.deepEqual(
		await eventToMessage({
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
			username: "cadence [they]",
			content: "preceding\n\n```\ncode block\n```\n\nfollowing `code` is inline",
			avatar_url: undefined
		}]
	)
})

test("event2message: code block contents are formatted correctly and not escaped", async t => {
	t.deepEqual(
		await eventToMessage({
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
			username: "cadence [they]",
			content: "```\ninput = input.replace(/(<\\/?([^ >]+)[^>]*>)?\\n(<\\/?([^ >]+)[^>]*>)?/g,\n_input_ = input = input.replace(/(<\\/?([^ >]+)[^>]*>)?\\n(<\\/?([^ >]+)[^>]*>)?/g,\n```\n\n`input = input.replace(/(<\\/?([^ >]+)[^>]*>)?\\n(<\\/?([^ >]+)[^>]*>)?/g,`",
			avatar_url: undefined
		}]
	)
})

test("event2message: quotes have an appropriate amount of whitespace", async t => {
	t.deepEqual(
		await eventToMessage({
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
			username: "cadence [they]",
			content: "> Chancellor of Germany Angela Merkel, on March 17, 2017: they did not shake hands\n🤨",
			avatar_url: undefined
		}]
	)
})

test("event2message: m.emote markdown syntax is escaped", async t => {
	t.deepEqual(
		await eventToMessage({
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
			username: "cadence [they]",
			content: "\\* cadence \\[they\\] shows you \\*\\*her\\*\\* **_extreme_** \\\\\\*test\\\\\\* of",
			avatar_url: undefined
		}]
	)
})

test("event2message: rich reply to a sim user", async t => {
	t.deepEqual(
		await eventToMessage({
			"type": "m.room.message",
			"sender": "@cadence:cadence.moe",
			"content": {
				"msgtype": "m.text",
				"body": "> <@_ooye_kyuugryphon:cadence.moe> Slow news day.\n\nTesting this reply, ignore",
				"format": "org.matrix.custom.html",
				"formatted_body": "<mx-reply><blockquote><a href=\"https://matrix.to/#/!fGgIymcYWOqjbSRUdV:cadence.moe/$Fxy8SMoJuTduwReVkHZ1uHif9EuvNx36Hg79cltiA04?via=cadence.moe&via=feather.onl\">In reply to</a> <a href=\"https://matrix.to/#/@_ooye_kyuugryphon:cadence.moe\">@_ooye_kyuugryphon:cadence.moe</a><br>Slow news day.</blockquote></mx-reply>Testing this reply, ignore",
				"m.relates_to": {
					"m.in_reply_to": {
						"event_id": "$Fxy8SMoJuTduwReVkHZ1uHif9EuvNx36Hg79cltiA04"
					}
				}
			},
			"origin_server_ts": 1693029683016,
			"unsigned": {
				"age": 91,
				"transaction_id": "m1693029682894.510"
			},
			"event_id": "$v_Gtr-bzv9IVlSLBO5DstzwmiDd-GSFaNfHX66IupV8",
			"room_id": "!fGgIymcYWOqjbSRUdV:cadence.moe"
		}, data.guild.general, {
			api: {
				getEvent: mockGetEvent(t, "!fGgIymcYWOqjbSRUdV:cadence.moe", "$Fxy8SMoJuTduwReVkHZ1uHif9EuvNx36Hg79cltiA04", {
					type: "m.room.message",
					content: {
						msgtype: "m.text",
						body: "Slow news day."
					},
					sender: "@_ooye_kyuugryphon:cadence.moe"
				})
			}
		}),
		[{
			username: "cadence [they]",
			content: "<:L1:1144820033948762203><:L2:1144820084079087647>https://discord.com/channels/112760669178241024/687028734322147344/1144865310588014633 <@111604486476181504>: Slow news day.\nTesting this reply, ignore",
			avatar_url: "https://matrix.cadence.moe/_matrix/media/r0/download/cadence.moe/azCAhThKTojXSZJRoWwZmhvU"
		}]
	)
})

test("event2message: rich reply to a matrix user's long message with formatting", async t => {
	t.deepEqual(
		await eventToMessage({
			"type": "m.room.message",
			"sender": "@cadence:cadence.moe",
			"content": {
			  "msgtype": "m.text",
			  "body": "> <@cadence:cadence.moe> ```\n> i should have a little happy test\n> ```\n> * list **bold** _em_ ~~strike~~\n> # heading 1\n> ## heading 2\n> ### heading 3\n> https://cadence.moe\n> [legit website](https://cadence.moe)\n\nno you can't!!!",
			  "format": "org.matrix.custom.html",
			  "formatted_body": "<mx-reply><blockquote><a href=\"https://matrix.to/#/!fGgIymcYWOqjbSRUdV:cadence.moe/$Fxy8SMoJuTduwReVkHZ1uHif9EuvNx36Hg79cltiA04?via=cadence.moe&via=feather.onl\">In reply to</a> <a href=\"https://matrix.to/#/@cadence:cadence.moe\">@cadence:cadence.moe</a><br><pre><code>i should have a little happy test\n</code></pre>\n<ul>\n<li>list <strong>bold</strong> <em>em</em> ~~strike~~</li>\n</ul>\n<h1>heading 1</h1>\n<h2>heading 2</h2>\n<h3>heading 3</h3>\n<p>https://cadence.moe<br /><a href=\"https://cadence.moe\">legit website</a></p>\n</blockquote></mx-reply><strong>no you can't!!!</strong>",
			  "m.relates_to": {
				 "m.in_reply_to": {
					"event_id": "$Fxy8SMoJuTduwReVkHZ1uHif9EuvNx36Hg79cltiA04"
				 }
			  }
			},
			"origin_server_ts": 1693037401693,
			"unsigned": {
			  "age": 381,
			  "transaction_id": "m1693037401592.521"
			},
			"event_id": "$v_Gtr-bzv9IVlSLBO5DstzwmiDd-GSFaNfHX66IupV8",
			"room_id": "!fGgIymcYWOqjbSRUdV:cadence.moe"
		 }, data.guild.general, {
			api: {
				getEvent: mockGetEvent(t, "!fGgIymcYWOqjbSRUdV:cadence.moe", "$Fxy8SMoJuTduwReVkHZ1uHif9EuvNx36Hg79cltiA04", {
					"type": "m.room.message",
					"sender": "@cadence:cadence.moe",
					"content": {
						"msgtype": "m.text",
						"body": "```\ni should have a little happy test\n```\n* list **bold** _em_ ~~strike~~\n# heading 1\n## heading 2\n### heading 3\nhttps://cadence.moe\n[legit website](https://cadence.moe)",
						"format": "org.matrix.custom.html",
						"formatted_body": "<pre><code>i should have a little happy test\n</code></pre>\n<ul>\n<li>list <strong>bold</strong> <em>em</em> ~~strike~~</li>\n</ul>\n<h1>heading 1</h1>\n<h2>heading 2</h2>\n<h3>heading 3</h3>\n<p>https://cadence.moe<br><a href=\"https://cadence.moe\">legit website</a></p>\n"
					}
				})
			}
		}),
		[{
			username: "cadence [they]",
			content: "<:L1:1144820033948762203><:L2:1144820084079087647>https://discord.com/channels/112760669178241024/687028734322147344/1144865310588014633 Ⓜ️**cadence**: i should have a little...\n**no you can't!!!**",
			avatar_url: "https://matrix.cadence.moe/_matrix/media/r0/download/cadence.moe/azCAhThKTojXSZJRoWwZmhvU"
		}]
	)
})

test("event2message: with layered rich replies, the preview should only be the real text", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: "> <@cadence:cadence.moe> two\n\nthree",
				format: "org.matrix.custom.html",
				formatted_body: "<mx-reply><blockquote><a href=\"https://matrix.to/#/!PnyBKvUBOhjuCucEfk:cadence.moe/$f-noT-d-Eo_Xgpc05Ww89ErUXku4NwKWYGHLzWKo1kU?via=cadence.moe\">In reply to</a> <a href=\"https://matrix.to/#/@cadence:cadence.moe\">@cadence:cadence.moe</a><br>two</blockquote></mx-reply>three",
				"m.relates_to": {
					"m.in_reply_to": {
						event_id: "$Fxy8SMoJuTduwReVkHZ1uHif9EuvNx36Hg79cltiA04"
					}
				}
			},
			event_id: "$v_Gtr-bzv9IVlSLBO5DstzwmiDd-GSFaNfHX66IupV8",
			room_id: "!fGgIymcYWOqjbSRUdV:cadence.moe"
		 }, data.guild.general, {
			api: {
				getEvent: mockGetEvent(t, "!fGgIymcYWOqjbSRUdV:cadence.moe", "$Fxy8SMoJuTduwReVkHZ1uHif9EuvNx36Hg79cltiA04", {
					"type": "m.room.message",
					"sender": "@cadence:cadence.moe",
					"content": {
						"msgtype": "m.text",
						"body": "> <@cadence:cadence.moe> one\n\ntwo",
						"format": "org.matrix.custom.html",
						"formatted_body": "<mx-reply><blockquote><a href=\"https://matrix.to/#/!PnyBKvUBOhjuCucEfk:cadence.moe/$5UtboIC30EFlAYD_Oh0pSYVW8JqOp6GsDIJZHtT0Wls?via=cadence.moe\">In reply to</a> <a href=\"https://matrix.to/#/@cadence:cadence.moe\">@cadence:cadence.moe</a><br>one</blockquote></mx-reply>two",
						"m.relates_to": {
							"m.in_reply_to": {
								"event_id": "$5UtboIC30EFlAYD_Oh0pSYVW8JqOp6GsDIJZHtT0Wls"
							}
						}
					}
				})
			}
		}),
		[{
			username: "cadence [they]",
			content: "<:L1:1144820033948762203><:L2:1144820084079087647>https://discord.com/channels/112760669178241024/687028734322147344/1144865310588014633 Ⓜ️**cadence**: two\nthree",
			avatar_url: "https://matrix.cadence.moe/_matrix/media/r0/download/cadence.moe/azCAhThKTojXSZJRoWwZmhvU"
		}]
	)
})
