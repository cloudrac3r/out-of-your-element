const assert = require("assert").strict
const fs = require("fs")
const {test} = require("supertape")
const {eventToMessage} = require("./event-to-message")
const {convertImageStream} = require("./emoji-sheet")
const data = require("../../../test/data")
const {MatrixServerError} = require("../../matrix/mreq")
const {select, discord} = require("../../passthrough")

/* c8 ignore next 7 */
function slow() {
	if (process.argv.includes("--slow")) {
		return test
	} else {
		return test.skip
	}
}

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
	const a2 = JSON.stringify(a.messagesToSend[0].content)
	const b2 = JSON.stringify(b.messagesToSend[0].content)
	t.equal(a2, b2)
}

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
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "testing plaintext",
				avatar_url: undefined,
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: any markdown in body is escaped, except strikethrough", async t => {
	t.deepEqual(
		await eventToMessage({
			content: {
				body: "testing **special** ~~things~~ which _should_ *not* `trigger` @any <effects>, except strikethrough",
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
		}, {}, {
			snow: {
				guild: {
					searchGuildMembers: () => []
				}
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "testing \\*\\*special\\*\\* ~~things~~ which \\_should\\_ \\*not\\* \\`trigger\\` @any <effects>, except strikethrough",
				avatar_url: undefined,
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: links in formatted body are not broken", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: "kyuugryphon I wonder what the midjourney text description of this photo is https://upload.wikimedia.org/wikipedia/commons/f/f3/After_gay_pride%2C_rainbow_flags_flying_along_Beach_Street_%2814853144744%29.jpg",
				format: "org.matrix.custom.html",
				formatted_body: "<a href=\"https://matrix.to/#/@_ooye_kyuugryphon:cadence.moe\">kyuugryphon</a> I wonder what the midjourney text description of this photo is https://upload.wikimedia.org/wikipedia/commons/f/f3/After_gay_pride%2C_rainbow_flags_flying_along_Beach_Street_%2814853144744%29.jpg"
			},
			origin_server_ts: 1693739630700,
			unsigned: {
				age: 39,
				transaction_id: "m1693739630587.160"
			},
			event_id: "$zANQGOdnHKZj48lrajojsejH86KNYST26imgb2Sw1Jg",
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe"
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "<@111604486476181504> I wonder what the midjourney text description of this photo is https://upload.wikimedia.org/wikipedia/commons/f/f3/After_gay_pride%2C_rainbow_flags_flying_along_Beach_Street_%2814853144744%29.jpg",
				avatar_url: undefined,
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: links in plaintext body are not broken", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: "I wonder what the midjourney text description of this photo is https://upload.wikimedia.org/wikipedia/commons/f/f3/After_gay_pride%2C_rainbow_flags_flying_along_Beach_Street_%2814853144744%29.jpg",
			},
			origin_server_ts: 1693739630700,
			unsigned: {
				age: 39,
				transaction_id: "m1693739630587.160"
			},
			event_id: "$zANQGOdnHKZj48lrajojsejH86KNYST26imgb2Sw1Jg",
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe"
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "I wonder what the midjourney text description of this photo is https://upload.wikimedia.org/wikipedia/commons/f/f3/After_gay_pride%2C_rainbow_flags_flying_along_Beach_Street_%2814853144744%29.jpg",
				avatar_url: undefined,
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: links in plaintext body are not broken when preceded by a newline", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: "java redstoners will be like \"I hate bedrock edition redstone!!\" meanwhile java edition:\nhttps://youtu.be/g_ORb7bN3CM"
			},
			event_id: "$b1c5gJZfh1gq3zz6UkhI1whJ61JVvgvvzbdSPEYnTbY",
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe"
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "java redstoners will be like \"I hate bedrock edition redstone!!\" meanwhile java edition:\nhttps://youtu.be/g_ORb7bN3CM",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: links in formatted body where the text & href are the same, just post the link once", async t => {
	t.deepEqual(
		await eventToMessage({
			sender: "@cadence:cadence.moe",
			type: "m.room.message",
			content: {
				body: "https://privatebin.net/?9111cb16f28da21b#62CKkEr6WvXZ1gQv2M6agazsA7tGYX8ZP8drETYujYZr",
				format: "org.matrix.custom.html",
				formatted_body: "<a href=\"https://privatebin.net/?9111cb16f28da21b#62CKkEr6WvXZ1gQv2M6agazsA7tGYX8ZP8drETYujYZr\">https://privatebin.net/?9111cb16f28da21b#62CKkEr6WvXZ1gQv2M6agazsA7tGYX8ZP8drETYujYZr</a>",
				msgtype: "m.text"
			},
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
			event_id: "$p3AOv1eReiSH0g06_8AZ0WH0qSeaGdqwHhiNx_hz-bs",
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "https://privatebin.net/?9111cb16f28da21b#62CKkEr6WvXZ1gQv2M6agazsA7tGYX8ZP8drETYujYZr",
				avatar_url: undefined,
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: markdown in link text does not attempt to be escaped because that doesn't work", async t => {
	t.deepEqual(
		await eventToMessage({
			content: {
				body: "hey mario sports mix [she/her], is it possible to listen on a unix socket?",
				format: "org.matrix.custom.html",
				formatted_body: "hey <a href=\"https://matrix.to/#/%40cadence%3Acadence.moe\">mario sports mix [she/her]</a>, is it possible to listen on a unix socket?",
				"m.mentions": {
					"user_ids": [
						"@cadence:cadence.moe"
					]
				},
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
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "hey [@mario sports mix [she/her]](<https://matrix.to/#/%40cadence%3Acadence.moe>), is it possible to listen on a unix socket?",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: basic html is converted to markdown", async t => {
	t.deepEqual(
		await eventToMessage({
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: "this <strong>is</strong> a <em><strong>test</strong> <u>of</u></em> <del><em>formatting</em></del>"
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
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "this **is** a _**test** __of___ ~~_formatting_~~",
				avatar_url: undefined,
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: spoilers work", async t => {
	t.deepEqual(
		await eventToMessage({
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: `this <strong>is</strong> a <span data-mx-spoiler><em>test</em></span> of <span data-mx-spoiler="">spoilers</span>`
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
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "this **is** a ||_test_|| of ||spoilers||",
				avatar_url: undefined,
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: spoiler reasons work", async t => {
	t.deepEqual(
		await eventToMessage({
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: `<span data-mx-spoiler="cw crossword spoilers you'll never believe. don't tell anybody">zoe kills a 5 letter noun at the end</span>`
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
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "\\(cw crossword spoilers you'll never believe. don't tell anybody\\) ||zoe kills a 5 letter noun at the end||",
				avatar_url: undefined,
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
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
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "this \\*\\*is\\*\\* an **_extreme_** \\\\\\*test\\\\\\* of",
				avatar_url: undefined,
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
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
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "paragraph one\nline _two_\nline three\n\nparagraph two\nline _two_\nline three\n\nparagraph three\n\nparagraph four\nline two\nline three\nline four\n\nparagraph five",
				avatar_url: undefined,
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
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
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "line one: test       test\nline two: **test**       **test**\nline three: **test       test**\nline four: test       test\n       line five",
				avatar_url: undefined,
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
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
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "line one: test test\nline two: **test** **test**\nline three: **test test**\nline four: test test\nline five",
				avatar_url: undefined,
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
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
			"room_id": "!kLRqKKUQXcibIMtOpl:cadence.moe"
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "* line one\n* line two\n* line three\n  * nested one\n  * nested two\n* line four",
				avatar_url: undefined,
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
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
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: (("a".repeat(130) + " ").repeat(15)).slice(0, -1),
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}, {
				username: "cadence [they]",
				content: (("a".repeat(130) + " ").repeat(4)).slice(0, -1),
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: code blocks work", async t => {
	t.deepEqual(
		await eventToMessage({
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: "<p>preceding</p>\n<pre><code>code block\n</code></pre>\n<p>following <code>code</code> is inline</p>"
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
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "preceding\n\n```\ncode block\n```\n\nfollowing `code` is inline",
				avatar_url: undefined,
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: code block contents are formatted correctly and not escaped", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: "<pre><code>input = input.replace(/(&lt;\\/?([^ &gt;]+)[^&gt;]*&gt;)?\\n(&lt;\\/?([^ &gt;]+)[^&gt;]*&gt;)?/g,\n_input_ = input = input.replace(/(&lt;\\/?([^ &gt;]+)[^&gt;]*&gt;)?\\n(&lt;\\/?([^ &gt;]+)[^&gt;]*&gt;)?/g,\n</code></pre>\n<p><code>input = input.replace(/(&lt;\\/?([^ &gt;]+)[^&gt;]*&gt;)?\\n(&lt;\\/?([^ &gt;]+)[^&gt;]*&gt;)?/g,</code></p>\n"
			},
			event_id: "$pGkWQuGVmrPNByrFELxhzI6MCBgJecr5I2J3z88Gc2s",
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe"
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "```\ninput = input.replace(/(<\\/?([^ >]+)[^>]*>)?\\n(<\\/?([^ >]+)[^>]*>)?/g,\n_input_ = input = input.replace(/(<\\/?([^ >]+)[^>]*>)?\\n(<\\/?([^ >]+)[^>]*>)?/g,\n```\n\n`input = input.replace(/(<\\/?([^ >]+)[^>]*>)?\\n(<\\/?([^ >]+)[^>]*>)?/g,`",
				avatar_url: undefined,
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: code blocks use double backtick as delimiter when necessary", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: "<code>backtick in ` the middle</code>, <code>backtick at the edge`</code>"
			},
			event_id: "$pGkWQuGVmrPNByrFELxhzI6MCBgJecr5I2J3z88Gc2s",
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe"
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "``backtick in ` the middle``, `` backtick at the edge` ``",
				avatar_url: undefined,
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: inline code is converted to code block if it contains both delimiters", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: "<code>` one two ``</code>"
			},
			event_id: "$pGkWQuGVmrPNByrFELxhzI6MCBgJecr5I2J3z88Gc2s",
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe"
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "``` ` one two `` ```",
				avatar_url: undefined,
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: code blocks are uploaded as attachments instead if they contain incompatible backticks", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: 'So if you run code like this<pre><code class="language-java">System.out.println("```");</code></pre>it should print a markdown formatted code block'
			},
			event_id: "$pGkWQuGVmrPNByrFELxhzI6MCBgJecr5I2J3z88Gc2s",
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe"
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "So if you run code like this `[inline_code.java]` it should print a markdown formatted code block",
				attachments: [{id: "0", filename: "inline_code.java"}],
				pendingFiles: [{name: "inline_code.java", buffer: Buffer.from('System.out.println("```");')}],
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: code blocks are uploaded as attachments instead if they contain incompatible backticks (default to txt file extension)", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: 'So if you run code like this<pre><code>System.out.println("```");</code></pre>it should print a markdown formatted code block'
			},
			event_id: "$pGkWQuGVmrPNByrFELxhzI6MCBgJecr5I2J3z88Gc2s",
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe"
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "So if you run code like this `[inline_code.txt]` it should print a markdown formatted code block",
				attachments: [{id: "0", filename: "inline_code.txt"}],
				pendingFiles: [{name: "inline_code.txt", buffer: Buffer.from('System.out.println("```");')}],
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: characters are encoded properly in code blocks", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: '<pre><code class="rs language-rs">fn extract_diff(chat_response: &amp;str) -&gt; Result&lt;String&gt; {'
					+ '\n    let fragments = regex!(r#"^```diff.*?^(.*?)^```.*?($|\\z)"#sm)'
					+ '\n        .captures_iter(chat_response)'
					+ '\n        .map(|c| c.get(1).unwrap().as_str())'
					+ '\n        .collect::&lt;String&gt;();'
			  		+ '\n</code></pre>'
			},
			event_id: "$pGkWQuGVmrPNByrFELxhzI6MCBgJecr5I2J3z88Gc2s",
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe"
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "`[inline_code.rs]`",
				attachments: [{id: "0", filename: "inline_code.rs"}],
				pendingFiles: [{name: "inline_code.rs", buffer: Buffer.from(
					'fn extract_diff(chat_response: &str) -> Result<String> {'
					+ '\n    let fragments = regex!(r#"^```diff.*?^(.*?)^```.*?($|\\z)"#sm)'
					+ '\n        .captures_iter(chat_response)'
					+ '\n        .map(|c| c.get(1).unwrap().as_str())'
					+ '\n        .collect::<String>();'
				)}],
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
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
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "> Chancellor of Germany Angela Merkel, on March 17, 2017: they did not shake hands\n🤨",
				avatar_url: undefined,
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: lists have appropriate line breaks", async t => {
	t.deepEqual(
		await eventToMessage({
			content: {
				body: 'i am not certain what you mean by "already exists with as discord". my goals are\n' +
					'* bridgeing specific channels with existing matrix rooms\n' +
					'  * optionally maybe entire "servers"\n' +
					'* offering the bridge as a public service ',
				format: 'org.matrix.custom.html',
				formatted_body: '<p>i am not certain what you mean by "already exists with as discord". my goals are</p>\n' +
					'<ul>\n' +
					'<li>bridgeing specific channels with existing matrix rooms\n' +
					'<ul>\n' +
					'<li>optionally maybe entire "servers"</li>\n' +
					'</ul>\n' +
					'</li>\n' +
					'<li>offering the bridge as a public service</li>\n' +
					'</ul>\n',
				'm.mentions': {},
				msgtype: 'm.text'
			},
			room_id: '!TqlyQmifxGUggEmdBN:cadence.moe',
			sender: '@Milan:tchncs.de',
			type: 'm.room.message',
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "Milan",
				content: `i am not certain what you mean by "already exists with as discord". my goals are\n\n* bridgeing specific channels with existing matrix rooms\n  * optionally maybe entire "servers"\n* offering the bridge as a public service`,
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: ordered list start attribute works", async t => {
	t.deepEqual(
		await eventToMessage({
			content: {
				body: 'i am not certain what you mean by "already exists with as discord". my goals are\n' +
					'1. bridgeing specific channels with existing matrix rooms\n' +
					'  2. optionally maybe entire "servers"\n' +
					'3. offering the bridge as a public service ',
				format: 'org.matrix.custom.html',
				formatted_body: '<p>i am not certain what you mean by "already exists with as discord". my goals are</p>\n' +
					'<ol>\n' +
					'<li>bridgeing specific channels with existing matrix rooms\n' +
					'<ol start="2">\n' +
					'<li>optionally maybe entire "servers"</li>\n' +
					'</ol>\n' +
					'</li>\n' +
					'<li>offering the bridge as a public service</li>\n' +
					'</ol>\n',
				'm.mentions': {},
				msgtype: 'm.text'
			},
			room_id: '!TqlyQmifxGUggEmdBN:cadence.moe',
			sender: '@Milan:tchncs.de',
			type: 'm.room.message',
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "Milan",
				content: `i am not certain what you mean by "already exists with as discord". my goals are\n\n1. bridgeing specific channels with existing matrix rooms\n  2. optionally maybe entire "servers"\n2. offering the bridge as a public service`,
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: m.emote plaintext works", async t => {
	t.deepEqual(
		await eventToMessage({
			content: {
				msgtype: "m.emote",
				body: "tests an m.emote message"
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
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "\\* cadence \\[they\\] tests an m.emote message",
				avatar_url: undefined,
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
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
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "\\* cadence \\[they\\] shows you \\*\\*her\\*\\* **_extreme_** \\\\\\*test\\\\\\* of",
				avatar_url: undefined,
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
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
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "-# > <:L1:1144820033948762203><:L2:1144820084079087647>https://discord.com/channels/112760669178241024/687028734322147344/1144865310588014633 <@111604486476181504>:"
					+ " Slow news day."
					+ "\nTesting this reply, ignore",
				avatar_url: "https://bridge.example.org/download/matrix/cadence.moe/azCAhThKTojXSZJRoWwZmhvU",
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: rich reply to a rich reply to a multi-line message should correctly strip reply fallback", async t => {
	t.deepEqual(
		await eventToMessage({
			content: {
				body: "> <@cadence:cadence.moe> I just checked in a fix that will probably work, can you try reproducing this on the latest `main` branch and see if I fixed it?\n\nwill try later (tomorrow if I don't forgor)",
				format: "org.matrix.custom.html",
				formatted_body: "<mx-reply><blockquote><a href=\"https://matrix.to/#/!TqlyQmifxGUggEmdBN:cadence.moe/$A0Rj559NKOh2VndCZSTJXcvgi42gZWVfVQt73wA2Hn0?via=matrix.org&via=cadence.moe&via=syndicated.gay\">In reply to</a> <a href=\"https://matrix.to/#/@cadence:cadence.moe\">@cadence:cadence.moe</a><br />I just checked in a fix that will probably work, can you try reproducing this on the latest <code>main</code> branch and see if I fixed it?</blockquote></mx-reply>will try later (tomorrow if I don't forgor)",
				"m.relates_to": {
					"m.in_reply_to": {
						event_id: "$A0Rj559NKOh2VndCZSTJXcvgi42gZWVfVQt73wA2Hn0"
					}
				},
				msgtype: "m.text"
			},
			origin_server_ts: 1704857452930,
			sender: "@cadence:cadence.moe",
			type: "m.room.message",
			unsigned: {},
			event_id: "$Q5kNrPxGs31LfWOhUul5I03jNjlxKOwRmWVuivaqCHY",
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe"
		}, data.guild.general, {
			api: {
				getEvent: mockGetEvent(t, "!kLRqKKUQXcibIMtOpl:cadence.moe", "$A0Rj559NKOh2VndCZSTJXcvgi42gZWVfVQt73wA2Hn0", {
					"type": "m.room.message",
					"sender": "@cadence:cadence.moe",
					"content": {
						"msgtype": "m.text",
						"body": "> <@solonovamax:matrix.org> multipart messages will be deleted if the message is edited to require less space\n>  \n> \n> steps to reproduce:\n> \n> 1. send a message that is longer than 2000 characters (discord character limit)\n>   - bot will split message into two messages on discord\n> 2. edit message to be under 2000 characters (discord character limit)\n>   - bot will delete one of the messages on discord, and then edit the other one to include the edited content\n>   - the bot will *then* delete the message on matrix (presumably) because one of the messages on discord was deleted (by \n\nI just checked in a fix that will probably work, can you try reproducing this on the latest `main` branch and see if I fixed it?",
						"format": "org.matrix.custom.html",
						"formatted_body": "<mx-reply><blockquote><a href=\"https://matrix.to/#/!TqlyQmifxGUggEmdBN:cadence.moe/$u4OD19vd2GETkOyhgFVla92oDKI4ojwBf2-JeVCG7EI?via=cadence.moe&via=matrix.org&via=conduit.rory.gay\">In reply to</a> <a href=\"https://matrix.to/#/@solonovamax:matrix.org\">@solonovamax:matrix.org</a><br /><p>multipart messages will be deleted if the message is edited to require less space</p>\n<p>steps to reproduce:</p>\n<ol>\n<li>send a message that is longer than 2000 characters (discord character limit)</li>\n</ol>\n<ul>\n<li>bot will split message into two messages on discord</li>\n</ul>\n<ol start=\"2\">\n<li>edit message to be under 2000 characters (discord character limit)</li>\n</ol>\n<ul>\n<li>bot will delete one of the messages on discord, and then edit the other one to include the edited content</li>\n<li>the bot will <em>then</em> delete the message on matrix (presumably) because one of the messages on discord was deleted (by</li>\n</ul>\n</blockquote></mx-reply>I just checked in a fix that will probably work, can you try reproducing this on the latest <code>main</code> branch and see if I fixed it?",
						"m.relates_to": {
							"m.in_reply_to": {
								"event_id": "$u4OD19vd2GETkOyhgFVla92oDKI4ojwBf2-JeVCG7EI"
							}
						}
					},
					"origin_server_ts": 1704855484532,
					"unsigned": {
						"age": 19069564
					},
					"event_id": "$A0Rj559NKOh2VndCZSTJXcvgi42gZWVfVQt73wA2Hn0",
					"room_id": "!TqlyQmifxGUggEmdBN:cadence.moe"
				})
			},
			snow: {
				guild: {
					/* c8 ignore next 4 */
					searchGuildMembers: (_, options) => {
						t.fail(`should not search guild members, but actually searched for: ${options.query}`)
						return []
					}
				}
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "-# > <:L1:1144820033948762203><:L2:1144820084079087647>**Ⓜcadence [they]**:"
					+ " I just checked in a fix that will probably work..."
					+ "\nwill try later (tomorrow if I don't forgor)",
				avatar_url: undefined,
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: rich reply to an already-edited message will quote the new message content", async t => {
	t.deepEqual(
		await eventToMessage({
			"type": "m.room.message",
			"sender": "@cadence:cadence.moe",
			"content": {
				"msgtype": "m.text",
				"body": "> <@_ooye_kyuugryphon:cadence.moe> this is the new content. heya!\n\nhiiiii....",
				"format": "org.matrix.custom.html",
				"formatted_body": "<mx-reply><blockquote><a href=\"https://matrix.to/#/!fGgIymcYWOqjbSRUdV:cadence.moe/$DSQvWxOBB2DYaei6b83-fb33dQGYt5LJd_s8Nl2a43Q?via=cadence.moe&via=feather.onl\">In reply to</a> <a href=\"https://matrix.to/#/@_ooye_kyuugryphon:cadence.moe\">@_ooye_kyuugryphon:cadence.moe</a><br>this is the new content. heya!</blockquote></mx-reply>hiiiii....",
				"m.relates_to": {
					"m.in_reply_to": {
						"event_id": "$DSQvWxOBB2DYaei6b83-fb33dQGYt5LJd_s8Nl2a43Q"
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
				getEvent: mockGetEvent(t, "!fGgIymcYWOqjbSRUdV:cadence.moe", "$DSQvWxOBB2DYaei6b83-fb33dQGYt5LJd_s8Nl2a43Q", {
					type: "m.room.message",
					room_id: "!fGgIymcYWOqjbSRUdV:cadence.moe",
					sender: "@_ooye_kyuugryphon:cadence.moe",
					content: {
						"m.mentions": {},
						msgtype: "m.text",
						body: "this is the old content. don't use this!"
					},
					unsigned: {
						"m.relations": {
							"m.replace": {
								type: "m.room.message",
								room_id: "!fGgIymcYWOqjbSRUdV:cadence.moe",
								sender: "@_ooye_kyuugryphon:cadence.moe",
								content: {
									"m.mentions": {},
									msgtype: "m.text",
									body: "* this is the new content. heya!",
									"m.new_content": {
										"m.mentions": {},
										msgtype: "m.text",
										body: "this is the new content. heya!"
									},
									"m.relates_to": {
										rel_type: "m.replace",
										event_id: "$DSQvWxOBB2DYaei6b83-fb33dQGYt5LJd_s8Nl2a43Q"
									}
								},
								event_id: "$JOrl8ycWpo7NIAxZ4u-VJmANVrZFBF41LXyp30y8VvU",
								user_id: "@_ooye_kyuugryphon:cadence.moe",
							}
						}
					}
				})
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "-# > <:L1:1144820033948762203><:L2:1144820084079087647><@111604486476181504>:"
					+ " this is the new content. heya!"
					+ "\nhiiiii....",
				avatar_url: "https://bridge.example.org/download/matrix/cadence.moe/azCAhThKTojXSZJRoWwZmhvU",
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: rich reply to a missing event will quote from formatted_body without a link", async t => {
	let called = 0
	t.deepEqual(
		await eventToMessage({
			"type": "m.room.message",
			"sender": "@cadence:cadence.moe",
			"content": {
				"msgtype": "m.text",
				"body": "> <@_ooye_kyuugryphon:cadence.moe>\n> > She *sells* *sea*shells by the *sea*shore.\n> But who *sees* the *sea*shells she *sells* sitting sideways?\n\nWhat a tongue-bender...",
				"format": "org.matrix.custom.html",
				"formatted_body": "<mx-reply><blockquote><a href=\"https://matrix.to/#/!fGgIymcYWOqjbSRUdV:cadence.moe/$Fxy8SMoJuTduwReVkHZ1uHif9EuvNx36Hg79cmadeup?via=cadence.moe&via=feather.onl\">In reply to</a> <a href=\"https://matrix.to/#/@_ooye_kyuugryphon:cadence.moe\">@_ooye_kyuugryphon:cadence.moe</a><br>"
					+ "<blockquote>She <em>sells</em> <em>sea</em>shells by the <em>sea</em>shore.</blockquote>But who <em>sees</em> the <em>sea</em>shells she <em>sells</em> sitting sideways?"
					+ "</blockquote></mx-reply>What a tongue-bender...",
				"m.relates_to": {
					"m.in_reply_to": {
						"event_id": "$Fxy8SMoJuTduwReVkHZ1uHif9EuvNx36Hg79cmadeup"
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
				async getEvent(roomID, eventID) {
					called++
					t.equal(roomID, "!fGgIymcYWOqjbSRUdV:cadence.moe")
					t.equal(eventID, "$Fxy8SMoJuTduwReVkHZ1uHif9EuvNx36Hg79cmadeup")
					throw new Error("missing event or something")
				}
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "-# > But who sees the seashells she sells sitting..."
					+ "\nWhat a tongue-bender...",
				avatar_url: "https://bridge.example.org/download/matrix/cadence.moe/azCAhThKTojXSZJRoWwZmhvU",
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
	)
	t.equal(called, 1, "getEvent should be called once")
})

test("event2message: rich reply to a missing event without formatted_body will use plaintext body and strip reply fallback", async t => {
	let called = 0
	t.deepEqual(
		await eventToMessage({
			"type": "m.room.message",
			"sender": "@cadence:cadence.moe",
			"content": {
				"msgtype": "m.text",
				"body": "> <@_ooye_kyuugryphon:cadence.moe> Slow news day.\n\nTesting this reply, ignore",
				"m.relates_to": {
					"m.in_reply_to": {
						"event_id": "$Fxy8SMoJuTduwReVkHZ1uHif9EuvNx36Hg79cmadeup"
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
				async getEvent(roomID, eventID) {
					called++
					t.equal(roomID, "!fGgIymcYWOqjbSRUdV:cadence.moe")
					t.equal(eventID, "$Fxy8SMoJuTduwReVkHZ1uHif9EuvNx36Hg79cmadeup")
					throw new Error("missing event or something")
				}
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "Testing this reply, ignore",
				avatar_url: "https://bridge.example.org/download/matrix/cadence.moe/azCAhThKTojXSZJRoWwZmhvU",
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
	)
	t.equal(called, 1, "getEvent should be called once")
})

test("event2message: rich reply to a missing event and no reply fallback will not generate a reply", async t => {
	let called = 0
	t.deepEqual(
		await eventToMessage({
			"type": "m.room.message",
			"sender": "@cadence:cadence.moe",
			"content": {
				"msgtype": "m.text",
				"body": "Testing this reply, ignore.",
				"format": "org.matrix.custom.html",
				"formatted_body": "Testing this reply, ignore.",
				"m.relates_to": {
					"m.in_reply_to": {
						"event_id": "$Fxy8SMoJuTduwReVkHZ1uHif9EuvNx36Hg79cmadeup"
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
				async getEvent(roomID, eventID) {
					called++
					t.equal(roomID, "!fGgIymcYWOqjbSRUdV:cadence.moe")
					t.equal(eventID, "$Fxy8SMoJuTduwReVkHZ1uHif9EuvNx36Hg79cmadeup")
					throw new Error("missing event or something")
				}
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "Testing this reply, ignore.",
				avatar_url: "https://bridge.example.org/download/matrix/cadence.moe/azCAhThKTojXSZJRoWwZmhvU",
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
	)
	t.equal(called, 1, "getEvent should be called once")
})

test("event2message: should avoid using blockquote contents as reply preview in rich reply to a sim user", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: "> <@_ooye_kyuugryphon:cadence.moe> > well, you said this, so...\n> \n> that can't be true! there's no way :o\n\nI agree!",
				format: "org.matrix.custom.html",
				formatted_body: "<mx-reply><blockquote><a href=\"https://matrix.to/#/!fGgIymcYWOqjbSRUdV:cadence.moe/$Fxy8SMoJuTduwReVkHZ1uHif9EuvNx36Hg79cltiA04?via=cadence.moe\">In reply to</a> <a href=\"https://matrix.to/#/@_ooye_kyuugryphon:cadence.moe\">@_ooye_kyuugryphon:cadence.moe</a><br><blockquote>well, you said this, so...<br /></blockquote><br />that can't be true! there's no way :o</blockquote></mx-reply>I agree!",
				"m.relates_to": {
					"m.in_reply_to": {
						event_id: "$Fxy8SMoJuTduwReVkHZ1uHif9EuvNx36Hg79cltiA04"
					}
				}
			},
			event_id: "$BpGx8_vqHyN6UQDARPDU51ftrlRBhleutRSgpAJJ--g",
			room_id: "!fGgIymcYWOqjbSRUdV:cadence.moe"
		}, data.guild.general, {
			api: {
				getEvent: mockGetEvent(t, "!fGgIymcYWOqjbSRUdV:cadence.moe", "$Fxy8SMoJuTduwReVkHZ1uHif9EuvNx36Hg79cltiA04", {
					"type": "m.room.message",
					"sender": "@_ooye_kyuugryphon:cadence.moe",
					"content": {
						"m.mentions": {},
						"msgtype": "m.text",
						"body": "> well, you said this, so...\n\nthat can't be true! there's no way :o",
						"format": "org.matrix.custom.html",
						"formatted_body": "<blockquote>well, you said this, so...<br></blockquote><br>that can't be true! there's no way :o"
					}
				})
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "-# > <:L1:1144820033948762203><:L2:1144820084079087647>https://discord.com/channels/112760669178241024/687028734322147344/1144865310588014633 <@111604486476181504>:"
					+ " that can't be true! there's no way :o"
					+ "\nI agree!",
				avatar_url: "https://bridge.example.org/download/matrix/cadence.moe/azCAhThKTojXSZJRoWwZmhvU",
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: should suppress embeds for links in reply preview", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@rnl:cadence.moe",
			content: {
				msgtype: "m.text",
				body: `> <@cadence:cadence.moe> https://www.youtube.com/watch?v=uX32idb1jMw\n\nEveryone in the comments is like "you're so ahead of the curve" and "crazy that this came out before the scandal" but I thought Mr Beast sucking was a common sentiment`,
				format: "org.matrix.custom.html",
				formatted_body: `<mx-reply><blockquote><a href="https://matrix.to/#/!fGgIymcYWOqjbSRUdV:cadence.moe/$qmyjr-ISJtnOM5WTWLI0fT7uSlqRLgpyin2d2NCglCU?via=cadence.moe">In reply to</a> <a href="https://matrix.to/#/@cadence:cadence.moe">@cadence:cadence.moe</a><br>https://www.youtube.com/watch?v=uX32idb1jMw</blockquote></mx-reply>Everyone in the comments is like "you're so ahead of the curve" and "crazy that this came out before the scandal" but I thought Mr Beast sucking was a common sentiment`,
				"m.relates_to": {
					"m.in_reply_to": {
						event_id: "$qmyjr-ISJtnOM5WTWLI0fT7uSlqRLgpyin2d2NCglCU"
					}
				}
			},
			event_id: "$0Bs3rbsXaeZmSztGMx1NIsqvOrkXOpIWebN-dqr09i4",
			room_id: "!fGgIymcYWOqjbSRUdV:cadence.moe"
		}, data.guild.general, {
			api: {
				getEvent: mockGetEvent(t, "!fGgIymcYWOqjbSRUdV:cadence.moe", "$qmyjr-ISJtnOM5WTWLI0fT7uSlqRLgpyin2d2NCglCU", {
					"type": "m.room.message",
					"sender": "@cadence:cadence.moe",
					"content": {
						"m.mentions": {},
						"msgtype": "m.text",
						"body": "https://www.youtube.com/watch?v=uX32idb1jMw"
					}
				})
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "RNL",
				content: "-# > <:L1:1144820033948762203><:L2:1144820084079087647>https://discord.com/channels/112760669178241024/687028734322147344/1273204543739396116 **Ⓜcadence [they]**:"
					+ " <https://www.youtube.com/watch?v=uX32idb1jMw>"
					+ `\nEveryone in the comments is like "you're so ahead of the curve" and "crazy that this came out before the scandal" but I thought Mr Beast sucking was a common sentiment`,
				avatar_url: undefined,
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: should include a reply preview when message ends with a blockquote", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: "> <@_ooye_cookie:cadence.moe> https://tootsuite.net/Warp-Gate2.gif\n> tanget: @ monster spawner\n> \n> **https://tootsuite.net/Warp-Gate2.gif**\n\naichmophobia",
				format: "org.matrix.custom.html",
				formatted_body: "<mx-reply><blockquote><a href=\"https://matrix.to/#/!fGgIymcYWOqjbSRUdV:cadence.moe/$uXM2I6w-XMtim14-OSZ_8Z2uQ6MDAZLT37eYIiEU6KQ?via=cadence.moe\">In reply to</a> <a href=\"https://matrix.to/#/@_ooye_cookie:cadence.moe\">@_ooye_cookie:cadence.moe</a><br><a href=\"https://tootsuite.net/Warp-Gate2.gif\">https://tootsuite.net/Warp-Gate2.gif</a><br />tanget: @ monster spawner<blockquote><strong><a href=\"https://tootsuite.net/Warp-Gate2.gif\">https://tootsuite.net/Warp-Gate2.gif</a></strong></blockquote></blockquote></mx-reply>aichmophobia",
				"m.relates_to": {
					"m.in_reply_to": {
						event_id: "$uXM2I6w-XMtim14-OSZ_8Z2uQ6MDAZLT37eYIiEU6KQ"
					}
				}
			},
			event_id: "$n6sg1X9rLeMzCYufJTRvaLzFeLQ-oEXjCWkHtRxcem4",
			room_id: "!fGgIymcYWOqjbSRUdV:cadence.moe"
		}, data.guild.general, {
			api: {
				getEvent: mockGetEvent(t, "!fGgIymcYWOqjbSRUdV:cadence.moe", "$uXM2I6w-XMtim14-OSZ_8Z2uQ6MDAZLT37eYIiEU6KQ", {
					type: 'm.room.message',
					sender: '@_ooye_cookie:cadence.moe',
					content: {
						'm.mentions': {},
						msgtype: 'm.text',
						body: 'https://tootsuite.net/Warp-Gate2.gif\n' +
						'\n' +
						'**https://tootsuite.net/Warp-Gate2.gif**',
						format: 'org.matrix.custom.html',
						formatted_body: '<a href="https://tootsuite.net/Warp-Gate2.gif">https://tootsuite.net/Warp-Gate2.gif</a><blockquote><strong><a href="https://tootsuite.net/Warp-Gate2.gif">https://tootsuite.net/Warp-Gate2.gif</a></strong></blockquote>'
					},
					unsigned: {
						'm.relations': {
							'm.replace': {
								type: 'm.room.message',
								room_id: '!fGgIymcYWOqjbSRUdV:cadence.moe',
								sender: '@_ooye_cookie:cadence.moe',
								content: {
									'm.mentions': {},
									msgtype: 'm.text',
									body: '* https://tootsuite.net/Warp-Gate2.gif\n' +
									'tanget: @ monster spawner\n' +
									'\n' +
									'**https://tootsuite.net/Warp-Gate2.gif**',
									format: 'org.matrix.custom.html',
									formatted_body: '* <a href="https://tootsuite.net/Warp-Gate2.gif">https://tootsuite.net/Warp-Gate2.gif</a><br>tanget: @ monster spawner<blockquote><strong><a href="https://tootsuite.net/Warp-Gate2.gif">https://tootsuite.net/Warp-Gate2.gif</a></strong></blockquote>',
									'm.new_content': {
										'm.mentions': {},
										msgtype: 'm.text',
										body: 'https://tootsuite.net/Warp-Gate2.gif\n' +
										'tanget: @ monster spawner\n' +
										'\n' +
										'**https://tootsuite.net/Warp-Gate2.gif**',
										format: 'org.matrix.custom.html',
										formatted_body: '<a href="https://tootsuite.net/Warp-Gate2.gif">https://tootsuite.net/Warp-Gate2.gif</a><br>tanget: @ monster spawner<blockquote><strong><a href="https://tootsuite.net/Warp-Gate2.gif">https://tootsuite.net/Warp-Gate2.gif</a></strong></blockquote>'
									},
									'm.relates_to': {
										rel_type: 'm.replace',
										event_id: '$uXM2I6w-XMtim14-OSZ_8Z2uQ6MDAZLT37eYIiEU6KQ'
									}
								},
								event_id: '$onCj1MucuYz6-dFr30jcnnjSEDq50ouyEbRId1wtAa8',
								user_id: '@_ooye_cookie:cadence.moe',
							}
						}
					},
					user_id: '@_ooye_cookie:cadence.moe',
				})
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "-# > <:L1:1144820033948762203><:L2:1144820084079087647>**Ⓜ_ooye_cookie**:"
					+ " <https://tootsuite.net/Warp-Gate2.gif> tanget: @..."
					+ "\naichmophobia",
				avatar_url: "https://bridge.example.org/download/matrix/cadence.moe/azCAhThKTojXSZJRoWwZmhvU",
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: should include a reply preview when replying to a description-only bot embed", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: "> <@_ooye_amanda:cadence.moe> > It looks like this queue has ended.\n\nso you're saying on matrix side I would have to edit ^this^ to add \"Timed out\" before the blockquote?",
				format: "org.matrix.custom.html",
				formatted_body: "<mx-reply><blockquote><a href=\"https://matrix.to/#/!CzvdIdUQXgUjDVKxeU:cadence.moe/$zJFjTvNn1w_YqpR4o4ISKUFisNRgZcu1KSMI_LADPVQ?via=cadence.moe&via=matrix.org\">In reply to</a> <a href=\"https://matrix.to/#/@_ooye_amanda:cadence.moe\">@_ooye_amanda:cadence.moe</a><br><blockquote>It looks like this queue has ended.</blockquote></blockquote></mx-reply>so you're saying on matrix side I would have to edit ^this^ to add &quot;Timed out&quot; before the blockquote?",
				"m.relates_to": {
					"m.in_reply_to": {
						event_id: "$zJFjTvNn1w_YqpR4o4ISKUFisNRgZcu1KSMI_LADPVQ"
					}
				}
			},
			event_id: "$qCOlszCawu5hlnF2a2PGyXeGGvtoNJdXyRAEaTF0waA",
			room_id: "!CzvdIdUQXgUjDVKxeU:cadence.moe"
		}, data.guild.general, {
			api: {
				getEvent: mockGetEvent(t, "!CzvdIdUQXgUjDVKxeU:cadence.moe", "$zJFjTvNn1w_YqpR4o4ISKUFisNRgZcu1KSMI_LADPVQ", {
					type: "m.room.message",
					room_id: "!edUxjVdzgUvXDUIQCK:cadence.moe",
					sender: "@_ooye_amanda:cadence.moe",
					content: {
						"m.mentions": {},
						msgtype: "m.notice",
						body: "> Now Playing: [**LOADING**](https://amanda.moe)\n" +
						"> \n" +
						"> `[​====[LOADING]=====]`",
						format: "org.matrix.custom.html",
						formatted_body: '<blockquote>Now Playing: <a href="https://amanda.moe"><strong>LOADING</strong></a><br><br><code>[​====[LOADING]=====]</code></blockquote>'
					},
					unsigned: {
						"m.relations": {
							"m.replace": {
								type: "m.room.message",
								room_id: "!edUxjVdzgUvXDUIQCK:cadence.moe",
								sender: "@_ooye_amanda:cadence.moe",
								content: {
									"m.mentions": {},
									msgtype: "m.notice",
									body: "* > It looks like this queue has ended.",
									format: "org.matrix.custom.html",
									formatted_body: "* <blockquote>It looks like this queue has ended.</blockquote>",
									"m.new_content": {
										"m.mentions": {},
										msgtype: "m.notice",
										body: "> It looks like this queue has ended.",
										format: "org.matrix.custom.html",
										formatted_body: "<blockquote>It looks like this queue has ended.</blockquote>"
									},
									"m.relates_to": {
										rel_type: "m.replace",
										event_id: "$zJFjTvNn1w_YqpR4o4ISKUFisNRgZcu1KSMI_LADPVQ"
									}
								},
								event_id: "$nrLF310vALFIXPNk6MEIy0lYiGXi210Ok0DATSaF5jQ",
								user_id: "@_ooye_amanda:cadence.moe",
							}
						},
						user_id: "@_ooye_amanda:cadence.moe",
					}
				})
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "-# > <:L1:1144820033948762203><:L2:1144820084079087647>https://discord.com/channels/112760669178241024/497161350934560778/1162625810109317170 <@1109360903096369153>:"
					+ " It looks like this queue has ended."
					+ `\nso you're saying on matrix side I would have to edit ^this^ to add "Timed out" before the blockquote?`,
				avatar_url: "https://bridge.example.org/download/matrix/cadence.moe/azCAhThKTojXSZJRoWwZmhvU",
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: entities are not escaped in main message or reply preview", async t => {
	// Intended result: Testing? in italics, followed by the sequence "':.`[]&things
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: "> <@cadence:cadence.moe> _Testing?_ \"':.`[]&things\n\n_Testing?_ \"':.`[]&things",
				format: "org.matrix.custom.html",
				formatted_body: "<mx-reply><blockquote><a href=\"https://matrix.to/#/!fGgIymcYWOqjbSRUdV:cadence.moe/$yIWjZPi6Xk56fBxJwqV4ANs_hYLjnWI2cNKbZ2zwk60?via=cadence.moe&via=feather.onl&via=mythic.onl\">In reply to</a> <a href=\"https://matrix.to/#/@cadence:cadence.moe\">@cadence:cadence.moe</a><br><em>Testing?</em> \"':.`[]&amp;things</blockquote></mx-reply><em>Testing?</em> &quot;':.`[]&amp;things",
				"m.relates_to": {
					"m.in_reply_to": {
						event_id: "$yIWjZPi6Xk56fBxJwqV4ANs_hYLjnWI2cNKbZ2zwk60"
					}
				}
			},
			event_id: "$2I7odT9okTdpwDcqOjkJb_A3utdO4V8Cp3LK6-Rvwcs",
			room_id: "!fGgIymcYWOqjbSRUdV:cadence.moe"
		}, data.guild.general, {
			api: {
				getEvent: mockGetEvent(t, "!fGgIymcYWOqjbSRUdV:cadence.moe", "$yIWjZPi6Xk56fBxJwqV4ANs_hYLjnWI2cNKbZ2zwk60", {
					type: "m.room.message",
					sender: "@cadence:cadence.moe",
					content: {
					  "msgtype": "m.text",
					  "body": "_Testing?_ \"':.`[]&things",
					  "format": "org.matrix.custom.html",
					  "formatted_body": "<em>Testing?</em> &quot;':.`[]&amp;things"
					},
					event_id: "$yIWjZPi6Xk56fBxJwqV4ANs_hYLjnWI2cNKbZ2zwk60",
					room_id: "!fGgIymcYWOqjbSRUdV:cadence.moe"
				})
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "-# > <:L1:1144820033948762203><:L2:1144820084079087647>**Ⓜcadence [they]**:"
					+ " Testing? \"':.`[]&things"
					+ "\n_Testing?_ \"':.\\`\\[\\]&things",
				avatar_url: "https://bridge.example.org/download/matrix/cadence.moe/azCAhThKTojXSZJRoWwZmhvU",
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: reply preview converts emoji formatting when replying to a known custom emoji", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: "> <@cadence:cadence.moe> :hippo:\n\nreply",
				format: "org.matrix.custom.html",
				formatted_body: "<mx-reply><blockquote><a href=\"https://matrix.to/#/!TqlyQmifxGUggEmdBN:cadence.moe/$zmO-dtPO6FubBkDxJZ5YmutPIsG1RgV5JJku-9LeGWs?via=cadence.moe&via=matrix.org&via=conduit.rory.gay\">In reply to</a> <a href=\"https://matrix.to/#/@cadence:cadence.moe\">@cadence:cadence.moe</a><br><img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/qWmbXeRspZRLPcjseyLmeyXC\" title=\":hippo:\" alt=\":hippo:\" /></blockquote></mx-reply>reply",
				"m.relates_to": {
					"m.in_reply_to": {
						event_id: "$zmO-dtPO6FubBkDxJZ5YmutPIsG1RgV5JJku-9LeGWs"
					}
				}
			},
			event_id: "$bCMLaLiMfoRajaGTgzaxAci-g8hJfkspVJIKwYktnvc",
			room_id: "!TqlyQmifxGUggEmdBN:cadence.moe"
		}, data.guild.general, {
			api: {
				getEvent: mockGetEvent(t, "!TqlyQmifxGUggEmdBN:cadence.moe", "$zmO-dtPO6FubBkDxJZ5YmutPIsG1RgV5JJku-9LeGWs", {
					type: "m.room.message",
					sender: "@cadence:cadence.moe",
					content: {
						msgtype: "m.text",
						body: ":hippo:",
						format: "org.matrix.custom.html",
						formatted_body: "<img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/qWmbXeRspZRLPcjseyLmeyXC\" title=\":hippo:\" alt=\":hippo:\">"
					}
				})
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "-# > <:L1:1144820033948762203><:L2:1144820084079087647>**Ⓜcadence [they]**:"
					+ " <:hippo:230201364309868544>"
					+ "\nreply",
				avatar_url: undefined,
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: reply preview can guess custom emoji based on the name if it is unknown", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: "> <@cadence:cadence.moe> :hippo:\n\nreply",
				format: "org.matrix.custom.html",
				formatted_body: "<mx-reply><blockquote><a href=\"https://matrix.to/#/!TqlyQmifxGUggEmdBN:cadence.moe/$zmO-dtPO6FubBkDxJZ5YmutPIsG1RgV5JJku-9LeGWs?via=cadence.moe&via=matrix.org&via=conduit.rory.gay\">In reply to</a> <a href=\"https://matrix.to/#/@cadence:cadence.moe\">@cadence:cadence.moe</a><br><img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/AHKNeXoRlprdULRMalhqfCdj\" title=\":hippo:\" alt=\":hippo:\" /></blockquote></mx-reply>reply",
				"m.relates_to": {
					"m.in_reply_to": {
						event_id: "$zmO-dtPO6FubBkDxJZ5YmutPIsG1RgV5JJku-9LeGWs"
					}
				}
			},
			event_id: "$bCMLaLiMfoRajaGTgzaxAci-g8hJfkspVJIKwYktnvc",
			room_id: "!TqlyQmifxGUggEmdBN:cadence.moe"
		}, data.guild.general, {
			api: {
				getEvent: mockGetEvent(t, "!TqlyQmifxGUggEmdBN:cadence.moe", "$zmO-dtPO6FubBkDxJZ5YmutPIsG1RgV5JJku-9LeGWs", {
					type: "m.room.message",
					sender: "@cadence:cadence.moe",
					content: {
						msgtype: "m.text",
						body: ":hippo:",
						format: "org.matrix.custom.html",
						formatted_body: "<img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/AHKNeXoRlprdULRMalhqfCdj\" title=\":hippo:\" alt=\":hippo:\">"
					}
				})
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "-# > <:L1:1144820033948762203><:L2:1144820084079087647>**Ⓜcadence [they]**:"
					+ " <:hippo:230201364309868544>"
					+ "\nreply",
				avatar_url: undefined,
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: reply preview uses emoji title text when replying to an unknown custom emoji", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: "> <@cadence:cadence.moe> :svkftngur_gkdne:\n\nreply",
				format: "org.matrix.custom.html",
				formatted_body: "<mx-reply><blockquote><a href=\"https://matrix.to/#/!TqlyQmifxGUggEmdBN:cadence.moe/$zmO-dtPO6FubBkDxJZ5YmutPIsG1RgV5JJku-9LeGWs?via=cadence.moe&via=matrix.org&via=conduit.rory.gay\">In reply to</a> <a href=\"https://matrix.to/#/@cadence:cadence.moe\">@cadence:cadence.moe</a><br><img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/AHKNeXoRlprdULRMalhqfCdj\" title=\":svkftngur_gkdne:\" alt=\":svkftngur_gkdne:\" /></blockquote></mx-reply>reply",
				"m.relates_to": {
					"m.in_reply_to": {
						event_id: "$zmO-dtPO6FubBkDxJZ5YmutPIsG1RgV5JJku-9LeGWs"
					}
				}
			},
			event_id: "$bCMLaLiMfoRajaGTgzaxAci-g8hJfkspVJIKwYktnvc",
			room_id: "!TqlyQmifxGUggEmdBN:cadence.moe"
		}, data.guild.general, {
			api: {
				getEvent: mockGetEvent(t, "!TqlyQmifxGUggEmdBN:cadence.moe", "$zmO-dtPO6FubBkDxJZ5YmutPIsG1RgV5JJku-9LeGWs", {
					type: "m.room.message",
					sender: "@cadence:cadence.moe",
					content: {
						msgtype: "m.text",
						body: ":svkftngur_gkdne:",
						format: "org.matrix.custom.html",
						formatted_body: "<img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/AHKNeXoRlprdULRMalhqfCdj\" title=\":svkftngur_gkdne:\" alt=\":svkftngur_gkdne:\">"
					}
				})
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "-# > <:L1:1144820033948762203><:L2:1144820084079087647>**Ⓜcadence [they]**:"
					+ " :svkftngur_gkdne:"
					+ "\nreply",
				avatar_url: undefined,
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: reply preview ignores garbage image", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: "> <@cadence:cadence.moe> I am having AAAA a nice day\n\nreply",
				format: "org.matrix.custom.html",
				formatted_body: "<mx-reply><blockquote><a href=\"https://matrix.to/#/!TqlyQmifxGUggEmdBN:cadence.moe/$zmO-dtPO6FubBkDxJZ5YmutPIsG1RgV5JJku-9LeGWs?via=cadence.moe&via=matrix.org&via=conduit.rory.gay\">In reply to</a> <a href=\"https://matrix.to/#/@cadence:cadence.moe\">@cadence:cadence.moe</a><br>I am having <img src=\"mxc://cadence.moe/AAAA\" /> a nice day</blockquote></mx-reply>reply",
				"m.relates_to": {
					"m.in_reply_to": {
						event_id: "$zmO-dtPO6FubBkDxJZ5YmutPIsG1RgV5JJku-9LeGWs"
					}
				}
			},
			event_id: "$bCMLaLiMfoRajaGTgzaxAci-g8hJfkspVJIKwYktnvc",
			room_id: "!TqlyQmifxGUggEmdBN:cadence.moe"
		}, data.guild.general, {
			api: {
				getEvent: mockGetEvent(t, "!TqlyQmifxGUggEmdBN:cadence.moe", "$zmO-dtPO6FubBkDxJZ5YmutPIsG1RgV5JJku-9LeGWs", {
					type: "m.room.message",
					sender: "@cadence:cadence.moe",
					content: {
						msgtype: "m.text",
						body: "I am having AAAA a nice day",
						format: "org.matrix.custom.html",
						formatted_body: "I am having <img src=\"mxc://cadence.moe/AAAA\" > a nice day"
					}
				})
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "-# > <:L1:1144820033948762203><:L2:1144820084079087647>**Ⓜcadence [they]**:"
					+ " I am having  a nice day"
					+ "\nreply",
				avatar_url: undefined,
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: reply to empty message doesn't show an extra line or anything", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: "> <@cadence:cadence.moe> \n\nreply",
				format: "org.matrix.custom.html",
				formatted_body: "<mx-reply><blockquote><a href=\"https://matrix.to/#/!TqlyQmifxGUggEmdBN:cadence.moe/$zmO-dtPO6FubBkDxJZ5YmutPIsG1RgV5JJku-9LeGWs?via=cadence.moe&via=matrix.org&via=conduit.rory.gay\">In reply to</a> <a href=\"https://matrix.to/#/@cadence:cadence.moe\">@cadence:cadence.moe</a><br></blockquote></mx-reply>reply",
				"m.relates_to": {
					"m.in_reply_to": {
						event_id: "$zmO-dtPO6FubBkDxJZ5YmutPIsG1RgV5JJku-9LeGWs"
					}
				}
			},
			event_id: "$bCMLaLiMfoRajaGTgzaxAci-g8hJfkspVJIKwYktnvc",
			room_id: "!TqlyQmifxGUggEmdBN:cadence.moe"
		}, data.guild.general, {
			api: {
				getEvent: mockGetEvent(t, "!TqlyQmifxGUggEmdBN:cadence.moe", "$zmO-dtPO6FubBkDxJZ5YmutPIsG1RgV5JJku-9LeGWs", {
					type: "m.room.message",
					sender: "@cadence:cadence.moe",
					content: {
						msgtype: "m.text",
						body: "",
						format: "org.matrix.custom.html",
						formatted_body: ""
					}
				})
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "-# > <:L1:1144820033948762203><:L2:1144820084079087647>**Ⓜcadence [they]**"
					+ "\nreply",
				avatar_url: undefined,
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: editing a rich reply to a sim user", async t => {
	const eventsFetched = []
	t.deepEqual(
		await eventToMessage({
			"type": "m.room.message",
			"sender": "@cadence:cadence.moe",
			"content": {
				"msgtype": "m.text",
				"body": "> <@_ooye_kyuugryphon:cadence.moe> Slow news day.\n\n * Editing this reply, which is also a test",
				"m.new_content": {
					"msgtype": "m.text",
					"body": "Editing this reply, which is also a test",
					"format": "org.matrix.custom.html",
					"formatted_body": "Editing this reply, which is also a test"
				},
				"format": "org.matrix.custom.html",
				"formatted_body": "<mx-reply><blockquote><a href=\"https://matrix.to/#/!fGgIymcYWOqjbSRUdV:cadence.moe/$Fxy8SMoJuTduwReVkHZ1uHif9EuvNx36Hg79cltiA04?via=cadence.moe&amp;via=feather.onl\">In reply to</a> <a href=\"https://matrix.to/#/@_ooye_kyuugryphon:cadence.moe\">@_ooye_kyuugryphon:cadence.moe</a><br>Slow news day.</blockquote></mx-reply> * Editing this reply, which is also a test",
				"m.relates_to": {
					"rel_type": "m.replace",
					"event_id": "$v_Gtr-bzv9IVlSLBO5DstzwmiDd-GSFaNfHX66IupV8"
				}
			},
			"origin_server_ts": 1693222931237,
			"unsigned": {
				"age": 44,
				"transaction_id": "m1693222931143.837"
			},
			"event_id": "$XEgssz13q-a7NLO7UZO2Oepq7tSiDBD7YRfr7Xu_QiA",
			"room_id": "!fGgIymcYWOqjbSRUdV:cadence.moe"
		}, data.guild.general, {
			api: {
				getEvent: (roomID, eventID) => {
					assert.ok(eventID === "$Fxy8SMoJuTduwReVkHZ1uHif9EuvNx36Hg79cltiA04" || eventID === "$v_Gtr-bzv9IVlSLBO5DstzwmiDd-GSFaNfHX66IupV8")
					if (eventID === "$Fxy8SMoJuTduwReVkHZ1uHif9EuvNx36Hg79cltiA04") {
						eventsFetched.push("past")
						return mockGetEvent(t, "!fGgIymcYWOqjbSRUdV:cadence.moe", "$Fxy8SMoJuTduwReVkHZ1uHif9EuvNx36Hg79cltiA04", {
							type: "m.room.message",
							content: {
								msgtype: "m.text",
								body: "Slow news day."
							},
							sender: "@_ooye_kyuugryphon:cadence.moe"
						})(roomID, eventID)
					} else if (eventID === "$v_Gtr-bzv9IVlSLBO5DstzwmiDd-GSFaNfHX66IupV8") {
						eventsFetched.push("original")
						return mockGetEvent(t, "!fGgIymcYWOqjbSRUdV:cadence.moe", "$v_Gtr-bzv9IVlSLBO5DstzwmiDd-GSFaNfHX66IupV8", {
							type: "m.room.message",
							sender: "@cadence:cadence.moe",
							content: {
								msgtype: "m.text",
								body: "> <@_ooye_kyuugryphon:cadence.moe> Slow news day.\n\nTesting this reply, ignore",
								format: "org.matrix.custom.html",
								formatted_body: "<mx-reply><blockquote><a href=\"https://matrix.to/#/!fGgIymcYWOqjbSRUdV:cadence.moe/$Fxy8SMoJuTduwReVkHZ1uHif9EuvNx36Hg79cltiA04?via=cadence.moe&via=feather.onl\">In reply to</a> <a href=\"https://matrix.to/#/@_ooye_kyuugryphon:cadence.moe\">@_ooye_kyuugryphon:cadence.moe</a><br>Slow news day.</blockquote></mx-reply>Testing this reply, ignore",
								"m.relates_to": {
									"m.in_reply_to": {
										event_id: "$Fxy8SMoJuTduwReVkHZ1uHif9EuvNx36Hg79cltiA04"
									}
								}
							}
						})(roomID, eventID)
					}
				}
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [{
				id: "1144874214311067708",
				message: {
					username: "cadence [they]",
					content: "-# > <:L1:1144820033948762203><:L2:1144820084079087647>https://discord.com/channels/112760669178241024/687028734322147344/1144865310588014633 <@111604486476181504>:"
						+ " Slow news day."
						+ "\nEditing this reply, which is also a test",
					avatar_url: "https://bridge.example.org/download/matrix/cadence.moe/azCAhThKTojXSZJRoWwZmhvU",
					allowed_mentions: {
						parse: ["users", "roles"]
					}
				}
			}],
			messagesToSend: []
		}
	)
	t.deepEqual(eventsFetched, ["original", "past"])
})

test("event2message: editing a plaintext body message", async t => {
	t.deepEqual(
		await eventToMessage({
			"type": "m.room.message",
			"sender": "@cadence:cadence.moe",
			"content": {
				"msgtype": "m.text",
				"body": " * well, I guess it's no longer brand new... it's existed for mere seconds...",
				"m.new_content": {
					"msgtype": "m.text",
					"body": "well, I guess it's no longer brand new... it's existed for mere seconds..."
				},
				"m.relates_to": {
					"rel_type": "m.replace",
					"event_id": "$7LIdiJCEqjcWUrpzWzS8TELOlFfBEe4ytgS7zn2lbSs"
				}
			},
			"origin_server_ts": 1693223873912,
			"unsigned": {
				"age": 42,
				"transaction_id": "m1693223873796.842"
			},
			"event_id": "$KxGwvVNzNcmlVbiI2m5kX-jMFNi3Jle71-uu1j7P7vM",
			"room_id": "!BnKuBPCvyfOkhcUjEu:cadence.moe"
		}, data.guild.general, {
			api: {
				getEvent: mockGetEvent(t, "!BnKuBPCvyfOkhcUjEu:cadence.moe", "$7LIdiJCEqjcWUrpzWzS8TELOlFfBEe4ytgS7zn2lbSs", {
					type: "m.room.message",
					sender: "@cadence:cadence.moe",
					content: {
						msgtype: "m.text",
						body: "brand new, never before seen message",
					}
				})
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [{
				id: "1145688633186193479",
				message: {
					username: "cadence [they]",
					content: "well, I guess it's no longer brand new... it's existed for mere seconds...",
					avatar_url: "https://bridge.example.org/download/matrix/cadence.moe/azCAhThKTojXSZJRoWwZmhvU",
					allowed_mentions: {
						parse: ["users", "roles"]
					}
				}
			}],
			messagesToSend: []
		}
	)
})

test("event2message: editing a plaintext message to be longer", async t => {
	t.deepEqual(
		await eventToMessage({
			"type": "m.room.message",
			"sender": "@cadence:cadence.moe",
			"content": {
				"msgtype": "m.text",
				"body": " * " + "aaaaaaaaa ".repeat(198) + "well, I guess it's no longer brand new... it's existed for mere seconds..." + "aaaaaaaaa ".repeat(20),
				"m.new_content": {
					"msgtype": "m.text",
					"body": "aaaaaaaaa ".repeat(198) + "well, I guess it's no longer brand new... it's existed for mere seconds..." + "aaaaaaaaa ".repeat(20)
				},
				"m.relates_to": {
					"rel_type": "m.replace",
					"event_id": "$7LIdiJCEqjcWUrpzWzS8TELOlFfBEe4ytgS7zn2lbSs"
				}
			},
			"origin_server_ts": 1693223873912,
			"unsigned": {
				"age": 42,
				"transaction_id": "m1693223873796.842"
			},
			"event_id": "$KxGwvVNzNcmlVbiI2m5kX-jMFNi3Jle71-uu1j7P7vM",
			"room_id": "!BnKuBPCvyfOkhcUjEu:cadence.moe"
		}, data.guild.general, {
			api: {
				getEvent: mockGetEvent(t, "!BnKuBPCvyfOkhcUjEu:cadence.moe", "$7LIdiJCEqjcWUrpzWzS8TELOlFfBEe4ytgS7zn2lbSs", {
					type: "m.room.message",
					sender: "@cadence:cadence.moe",
					content: {
						msgtype: "m.text",
						body: "brand new, never before seen message",
					}
				})
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [{
				id: "1145688633186193479",
				message: {
					content: "aaaaaaaaa ".repeat(198) + "well, I guess it's",
					username: "cadence [they]",
					avatar_url: "https://bridge.example.org/download/matrix/cadence.moe/azCAhThKTojXSZJRoWwZmhvU",
					allowed_mentions: {
						parse: ["users", "roles"]
					}
				}
			}],
			messagesToSend: [{
				content: "no longer brand new... it's existed for mere seconds..." + ("aaaaaaaaa ".repeat(20)).slice(0, -1),
				username: "cadence [they]",
				avatar_url: "https://bridge.example.org/download/matrix/cadence.moe/azCAhThKTojXSZJRoWwZmhvU",
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: editing a plaintext message to be shorter", async t => {
	t.deepEqual(
		await eventToMessage({
			"type": "m.room.message",
			"sender": "@cadence:cadence.moe",
			"content": {
				"msgtype": "m.text",
				"body": " * well, I guess it's no longer brand new... it's existed for mere seconds...",
				"m.new_content": {
					"msgtype": "m.text",
					"body": "well, I guess it's no longer brand new... it's existed for mere seconds..."
				},
				"m.relates_to": {
					"rel_type": "m.replace",
					"event_id": "$7LIdiJCEqjcWUrpzWzS8TELOlFfBEe4ytgS7zn2lbSt"
				}
			},
			"origin_server_ts": 1693223873912,
			"unsigned": {
				"age": 42,
				"transaction_id": "m1693223873796.842"
			},
			"event_id": "$KxGwvVNzNcmlVbiI2m5kX-jMFNi3Jle71-uu1j7P7vM",
			"room_id": "!BnKuBPCvyfOkhcUjEu:cadence.moe"
		}, data.guild.general, {
			api: {
				getEvent: mockGetEvent(t, "!BnKuBPCvyfOkhcUjEu:cadence.moe", "$7LIdiJCEqjcWUrpzWzS8TELOlFfBEe4ytgS7zn2lbSt", {
					type: "m.room.message",
					sender: "@cadence:cadence.moe",
					content: {
						msgtype: "m.text",
						body: "aaaaaaaaa ".repeat(198) + "well, I guess it's no longer brand new... it's existed for mere seconds..." + "aaaaaaaaa ".repeat(20)
					}
				})
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: ["1145688633186193481"],
			messagesToEdit: [{
				id: "1145688633186193480",
				message: {
					username: "cadence [they]",
					content: "well, I guess it's no longer brand new... it's existed for mere seconds...",
					avatar_url: "https://bridge.example.org/download/matrix/cadence.moe/azCAhThKTojXSZJRoWwZmhvU",
					allowed_mentions: {
						parse: ["users", "roles"]
					}
				}
			}],
			messagesToSend: []
		}
	)
})

test("event2message: editing a formatted body message", async t => {
	t.deepEqual(
		await eventToMessage({
			"type": "m.room.message",
			"sender": "@cadence:cadence.moe",
			"content": {
				"msgtype": "m.text",
				"body": " * **well, I guess it's no longer brand new... it's existed for mere seconds...**",
				"format": "org.matrix.custom.html",
				"formatted_body": "* <strong>well, I guess it's no longer brand new... it's existed for mere seconds...</strong>",
				"m.new_content": {
					"msgtype": "m.text",
					"body": "**well, I guess it's no longer brand new... it's existed for mere seconds...**",
					"format": "org.matrix.custom.html",
					"formatted_body": "<strong>well, I guess it's no longer brand new... it's existed for mere seconds...</strong>"
				},
				"m.relates_to": {
					"rel_type": "m.replace",
					"event_id": "$7LIdiJCEqjcWUrpzWzS8TELOlFfBEe4ytgS7zn2lbSs"
				}
			},
			"origin_server_ts": 1693223873912,
			"unsigned": {
				"age": 42,
				"transaction_id": "m1693223873796.842"
			},
			"event_id": "$KxGwvVNzNcmlVbiI2m5kX-jMFNi3Jle71-uu1j7P7vM",
			"room_id": "!BnKuBPCvyfOkhcUjEu:cadence.moe"
		}, data.guild.general, {
			api: {
				getEvent: mockGetEvent(t, "!BnKuBPCvyfOkhcUjEu:cadence.moe", "$7LIdiJCEqjcWUrpzWzS8TELOlFfBEe4ytgS7zn2lbSs", {
					type: "m.room.message",
					sender: "@cadence:cadence.moe",
					content: {
						msgtype: "m.text",
						body: "**brand new, never before seen message**",
						format: "org.matrix.custom.html",
						formatted_body: "<strong>brand new, never before seen message</strong>"
					}
				})
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [{
				id: "1145688633186193479",
				message: {
					username: "cadence [they]",
					content: "**well, I guess it's no longer brand new... it's existed for mere seconds...**",
					avatar_url: "https://bridge.example.org/download/matrix/cadence.moe/azCAhThKTojXSZJRoWwZmhvU",
					allowed_mentions: {
						parse: ["users", "roles"]
					}
				}
			}],
			messagesToSend: []
		}
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
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "-# > <:L1:1144820033948762203><:L2:1144820084079087647>https://discord.com/channels/112760669178241024/687028734322147344/1144865310588014633 **Ⓜcadence [they]**:"
					+ " i should have a little happy test   list bold em..."
					+ "\n**no you can't!!!**",
				avatar_url: "https://bridge.example.org/download/matrix/cadence.moe/azCAhThKTojXSZJRoWwZmhvU",
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: rich reply to an image", async t => {
	t.deepEqual(
		await eventToMessage({
			"type": "m.room.message",
			"sender": "@cadence:cadence.moe",
			"content": {
				"msgtype": "m.text",
				"body": "> <@cadence:cadence.moe> sent an image.\n\nCaught in 8K UHD VR QLED Epic Edition",
				"format": "org.matrix.custom.html",
				"formatted_body": "<mx-reply><blockquote><a href=\"https://matrix.to/#/!fGgIymcYWOqjbSRUdV:cadence.moe/$Fxy8SMoJuTduwReVkHZ1uHif9EuvNx36Hg79cltiA04?via=cadence.moe&via=feather.onl\">In reply to</a> <a href=\"https://matrix.to/#/@cadence:cadence.moe\">@cadence:cadence.moe</a><br>sent an image.</blockquote></mx-reply>Caught in 8K UHD VR QLED Epic Edition",
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
					type: "m.room.message",
					sender: "@_ooye_kyuugryphon:cadence.moe",
					content: {
						"m.mentions": {},
						msgtype: "m.image",
						url: "mxc://cadence.moe/ABfYgGdcIECnraZLGpRnoArG",
						external_url: "https://cdn.discordapp.com/attachments/1100319550446252084/1149300251648339998/arcafeappx2.png",
						body: "arcafeappx2.png",
						filename: "arcafeappx2.png",
						info: {
							mimetype: "image/png",
							w: 512,
							h: 512,
							size: 43990
						}
					}
				})
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "-# > <:L1:1144820033948762203><:L2:1144820084079087647>https://discord.com/channels/112760669178241024/687028734322147344/1144865310588014633 <@111604486476181504> 🖼️"
					+ "\nCaught in 8K UHD VR QLED Epic Edition",
				avatar_url: "https://bridge.example.org/download/matrix/cadence.moe/azCAhThKTojXSZJRoWwZmhvU",
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: rich reply to a spoiler should ensure the spoiler is hidden", async t => {
	t.deepEqual(
		await eventToMessage({
			"type": "m.room.message",
			"sender": "@cadence:cadence.moe",
			"content": {
				"msgtype": "m.text",
				"body": "> <@cadence:cadence.moe> ||zoe kills a 5 letter noun at the end. don't tell anybody|| cw crossword spoilers you'll never believe\n\nomg NO WAY!!",
				"format": "org.matrix.custom.html",
				"formatted_body": "<mx-reply><blockquote><a href=\"https://matrix.to/#/!fGgIymcYWOqjbSRUdV:cadence.moe/$Fxy8SMoJuTduwReVkHZ1uHif9EuvNx36Hg79cltiA04?via=cadence.moe&via=feather.onl\">In reply to</a> <a href=\"https://matrix.to/#/@cadence:cadence.moe\">@cadence:cadence.moe</a><br><span data-mx-spoiler=\"\">zoe kills a 5 letter noun at the end. don't tell anybody</span> cw crossword spoilers you'll never believe</blockquote></mx-reply>omg NO WAY!!",
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
					type: "m.room.message",
					sender: "@_ooye_kyuugryphon:cadence.moe",
					content: {
						"m.mentions": {},
						msgtype: "m.text",
						body: "||zoe kills a 5 letter noun at the end. don't tell anybody|| cw crossword spoilers you'll never believe",
						format: "org.matrix.custom.html",
						formatted_body: `<span data-mx-spoiler="">zoe kills a 5 letter noun at the end. don't tell anybody</span> cw crossword spoilers you'll never believe`
					}
				})
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "-# > <:L1:1144820033948762203><:L2:1144820084079087647>https://discord.com/channels/112760669178241024/687028734322147344/1144865310588014633 <@111604486476181504>:"
					+ " [spoiler] cw crossword spoilers you'll never..."
					+ "\nomg NO WAY!!",
				avatar_url: "https://bridge.example.org/download/matrix/cadence.moe/azCAhThKTojXSZJRoWwZmhvU",
				allowed_mentions: {
						parse: ["users", "roles"]
				}
			}]
		}
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
				formatted_body: "<mx-reply><blockquote><a href=\"https://matrix.to/#/!BnKuBPCvyfOkhcUjEu:cadence.moe/$f-noT-d-Eo_Xgpc05Ww89ErUXku4NwKWYGHLzWKo1kU?via=cadence.moe\">In reply to</a> <a href=\"https://matrix.to/#/@cadence:cadence.moe\">@cadence:cadence.moe</a><br>two</blockquote></mx-reply>three",
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
						"formatted_body": "<mx-reply><blockquote><a href=\"https://matrix.to/#/!BnKuBPCvyfOkhcUjEu:cadence.moe/$5UtboIC30EFlAYD_Oh0pSYVW8JqOp6GsDIJZHtT0Wls?via=cadence.moe\">In reply to</a> <a href=\"https://matrix.to/#/@cadence:cadence.moe\">@cadence:cadence.moe</a><br>one</blockquote></mx-reply>two",
						"m.relates_to": {
							"m.in_reply_to": {
								"event_id": "$5UtboIC30EFlAYD_Oh0pSYVW8JqOp6GsDIJZHtT0Wls"
							}
						}
					}
				})
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "-# > <:L1:1144820033948762203><:L2:1144820084079087647>https://discord.com/channels/112760669178241024/687028734322147344/1144865310588014633 **Ⓜcadence [they]**:"
					+ " two"
					+ "\nthree",
				avatar_url: "https://bridge.example.org/download/matrix/cadence.moe/azCAhThKTojXSZJRoWwZmhvU",
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: if event is a reply and starts with a quote, they should be separated by a blank line, so that they don't visually merge together", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@aflower:syndicated.gay",
			content: {
				body: "> <@aflower:syndicated.gay> i have a feeling that clients are *meant to* strip these reply fallbacks too, just that none of them, in reality, do\n\n>To strip the fallback on the <code>body</code>, the client should iterate over each line of the string, removing any lines that start with the fallback prefix (&quot;&gt; &ldquo;, including the space, without quotes) and stopping when a line is encountered without the prefix. This prefix is known as the &ldquo;fallback prefix sequence&rdquo;.",
				format: "org.matrix.custom.html",
				formatted_body: "<mx-reply><blockquote><a href=\"https://matrix.to/#/!TqlyQmifxGUggEmdBN:cadence.moe/$tTYQcke93fwocsc1K6itwUq85EG0RZ0ksCuIglKioks\">In reply to</a> <a href=\"https://matrix.to/#/@aflower:syndicated.gay\">@aflower:syndicated.gay</a><br/>i have a feeling that clients are <em>meant to</em> strip these reply fallbacks too, just that none of them, in reality, do</blockquote></mx-reply><blockquote>\n<p>To strip the fallback on the <code>body</code>, the client should iterate over each line of the string, removing any lines that start with the fallback prefix (&quot;&gt; “, including the space, without quotes) and stopping when a line is encountered without the prefix. This prefix is known as the “fallback prefix sequence”.</p>\n</blockquote>",
				"im.nheko.relations.v1.relations": [
					{
						event_id: "$tTYQcke93fwocsc1K6itwUq85EG0RZ0ksCuIglKioks",
						rel_type: "im.nheko.relations.v1.in_reply_to"
					}
				],
				"m.relates_to": {
					"m.in_reply_to": {
						event_id: "$tTYQcke93fwocsc1K6itwUq85EG0RZ0ksCuIglKioks"
					}
				},
				msgtype: "m.text"
			},
			room_id: "!TqlyQmifxGUggEmdBN:cadence.moe",
			event_id: "$nCvtZeBFedYuEavt4OftloCHc0kaFW2ktHCfIOklhjU",
		}, data.guild.general, {
			api: {
				getEvent: mockGetEvent(t, "!TqlyQmifxGUggEmdBN:cadence.moe", "$tTYQcke93fwocsc1K6itwUq85EG0RZ0ksCuIglKioks", {
					sender: "@aflower:syndicated.gay",
					type: "m.room.message",
					content: {
						body: "i have a feeling that clients are *meant to* strip these reply fallbacks too, just that none of them, in reality, do",
						format: "org.matrix.custom.html",
						formatted_body: "i have a feeling that clients are <em>meant to</em> strip these reply fallbacks too, just that none of them, in reality, do",
						msgtype: "m.text"
					}
				})
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "Rose",
				content: "-# > <:L1:1144820033948762203><:L2:1144820084079087647>**ⓂRose**:"
					+ " i have a feeling that clients are meant to strip..."
					+ "\n"
					+ "\n> To strip the fallback on the `body`, the client should iterate over each line of the string, removing any lines that start with the fallback prefix (\"> “, including the space, without quotes) and stopping when a line is encountered without the prefix. This prefix is known as the “fallback prefix sequence”.",
				avatar_url: "https://bridge.example.org/download/matrix/syndicated.gay/ZkBUPXCiXTjdJvONpLJmcbKP",
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: rich reply to a deleted event", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@ampflower:matrix.org",
			content: {
				msgtype: "m.text",
				body: "> <@ampflower:matrix.org> \n\nHuh it did the same thing here too",
				format: "org.matrix.custom.html",
				formatted_body: "<mx-reply><blockquote><a href=\"https://matrix.to/#/!TqlyQmifxGUggEmdBN:cadence.moe/$f-noT-d-Eo_Xgpc05Ww89ErUXku4NwKWYGHLzWKo1kU?via=cadence.moe\">In reply to</a> <a href=\"https://matrix.to/#/@ampflower:matrix.org\">@ampflower:matrix.org</a><br></blockquote></mx-reply>Huh it did the same thing here too",
				"m.relates_to": {
					"m.in_reply_to": {
						event_id: "$f-noT-d-Eo_Xgpc05Ww89ErUXku4NwKWYGHLzWKo1kU"
					}
				}
			},
			event_id: "$v_Gtr-bzv9IVlSLBO5DstzwmiDd-GSFaNfHX66IupV8",
			room_id: "!TqlyQmifxGUggEmdBN:cadence.moe"
		 }, data.guild.general, {
			api: {
				getEvent: mockGetEvent(t, "!TqlyQmifxGUggEmdBN:cadence.moe", "$f-noT-d-Eo_Xgpc05Ww89ErUXku4NwKWYGHLzWKo1kU", {
					type: "m.room.message",
					sender: "@ampflower:matrix.org",
					content: {},
					origin_server_ts: 1707798292953,
					unsigned: {
						redacted_because: {
							type: "m.room.redaction",
							room_id: "!TqlyQmifxGUggEmdBN:cadence.moe",
							sender: "@_ooye_bot:cadence.moe",
							content: {},
							redacts: "$uyOzmYhqcgF5i0bZb4MrAIEKEvzDOLgXdlRr1zfvWo0",
							origin_server_ts: 1707798294565,
							event_id: "$enCV-40Sut8llwALAV0T3qjwK7MvO9jgY9C4DHbxKXA",
							user_id: "@_ooye_bot:cadence.moe",
						},
					},
					user_id: "@ampflower:matrix.org"
				})
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "Ampflower 🌺",
				content: "-# > <:L1:1144820033948762203><:L2:1144820084079087647>**ⓂAmpflower 🌺** (in reply to a deleted message)"
					+ "\nHuh it did the same thing here too",
				avatar_url: "https://bridge.example.org/download/matrix/cadence.moe/PRfhXYBTOalvgQYtmCLeUXko",
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: rich reply to a state event with no body", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@ampflower:matrix.org",
			content: {
				msgtype: "m.text",
				body: "> <@ampflower:matrix.org> changed the room topic\n\nnice room topic",
				format: "org.matrix.custom.html",
				formatted_body: "<mx-reply><blockquote><a href=\"https://matrix.to/#/!TqlyQmifxGUggEmdBN:cadence.moe/$f-noT-d-Eo_Xgpc05Ww89ErUXku4NwKWYGHLzWKo1kU?via=cadence.moe\">In reply to</a> <a href=\"https://matrix.to/#/@ampflower:matrix.org\">@ampflower:matrix.org</a> changed the room topic<br></blockquote></mx-reply>nice room topic",
				"m.relates_to": {
					"m.in_reply_to": {
						event_id: "$f-noT-d-Eo_Xgpc05Ww89ErUXku4NwKWYGHLzWKo1kU"
					}
				}
			},
			event_id: "$v_Gtr-bzv9IVlSLBO5DstzwmiDd-GSFaNfHX66IupV8",
			room_id: "!TqlyQmifxGUggEmdBN:cadence.moe"
		 }, data.guild.general, {
			api: {
				getEvent: mockGetEvent(t, "!TqlyQmifxGUggEmdBN:cadence.moe", "$f-noT-d-Eo_Xgpc05Ww89ErUXku4NwKWYGHLzWKo1kU", {
					type: "m.room.topic",
					sender: "@ampflower:matrix.org",
					content: {
						topic: "you're cute"
					},
					user_id: "@ampflower:matrix.org"
				})
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "Ampflower 🌺",
				content: "-# > <:L1:1144820033948762203><:L2:1144820084079087647> (channel details edited)\nnice room topic",
				avatar_url: "https://bridge.example.org/download/matrix/cadence.moe/PRfhXYBTOalvgQYtmCLeUXko",
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: raw mentioning discord users in plaintext body works", async t => {
	t.deepEqual(
		await eventToMessage({
			content: {
				msgtype: "m.text",
				body: "<@114147806469554185> what do you think?"
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
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "<@114147806469554185> what do you think?",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: raw mentioning discord users in formatted body works", async t => {
	t.deepEqual(
		await eventToMessage({
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: `&lt;@114147806469554185&gt; what do you think?`
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
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "<@114147806469554185> what do you think?",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: mentioning discord users works", async t => {
	t.deepEqual(
		await eventToMessage({
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: `I'm just <a href="https://matrix.to/#/@_ooye_extremity:cadence.moe">extremity</a> testing mentions`
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
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "I'm just <@114147806469554185> testing mentions",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: mentioning discord users works when URL encoded", async t => {
	t.deepEqual(
		await eventToMessage({
			content: {
				body: "Crunch God a sample message",
				format: "org.matrix.custom.html",
				formatted_body: `<a href="https://matrix.to/#/%40_ooye_bojack_horseman%3Acadence.moe">Crunch God</a> a sample message`,
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
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "<@771520384671416320> a sample message",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: mentioning PK discord users works", async t => {
	t.deepEqual(
		await eventToMessage({
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: `I'm just <a href="https://matrix.to/#/@_ooye__pk_zoego:cadence.moe">Azalea</a> testing mentions`
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
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "I'm just **@Azalea &flwr; 🌺** (<@196188877885538304>) testing mentions",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: mentioning matrix users works", async t => {
	t.deepEqual(
		await eventToMessage({
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: `I'm just <a href="https://matrix.to/#/@rnl:cadence.moe">▲</a> testing mentions`
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
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "I'm just [@▲](<https://matrix.to/#/@rnl:cadence.moe>) testing mentions",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: multiple mentions are both escaped", async t => {
	t.deepEqual(
		await eventToMessage({
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: `<a href="https://matrix.to/#/@cadence:cadence.moe">@cadence:cadence.moe</a> can you kick my old account over there <a href="https://matrix.to/#/@amyiscoolz:matrix.atiusamy.com">@amyiscoolz:matrix.atiusamy.com</a>`
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
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "[@cadence:cadence.moe](<https://matrix.to/#/@cadence:cadence.moe>) can you kick my old account over there [@amyiscoolz:matrix.atiusamy.com](<https://matrix.to/#/@amyiscoolz:matrix.atiusamy.com>)",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: mentioning matrix users works even when Element disambiguates the user", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: "unascribed @unascribed:sleeping.town: if you want to run some experimental software, `11864f80cf` branch of OOYE has _vastly_ improved handling of PluralKit users. feel free to try it out, if you find bugs I'd appreciate you letting me know (just tag me at the place in chat where something went wrong)",
				format: "org.matrix.custom.html",
				formatted_body: "<a href=\"https://matrix.to/#/@unascribed:sleeping.town\">unascribed @unascribed:sleeping.town</a>: if you want to run some experimental software, <code>11864f80cf</code> branch of OOYE has <em>vastly</em> improved handling of PluralKit users. feel free to try it out, if you find bugs I'd appreciate you letting me know (just tag me at the place in chat where something went wrong)"
			},
			event_id: "$17qTyvkDykSp_4Wkjeuh9Y6j9hPe20ZY_E6V3UKAyUE",
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "[@unascribed](<https://matrix.to/#/@unascribed:sleeping.town>) if you want to run some experimental software, `11864f80cf` branch of OOYE has _vastly_ improved handling of PluralKit users. feel free to try it out, if you find bugs I'd appreciate you letting me know (just tag me at the place in chat where something went wrong)",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: mentioning bridged rooms works", async t => {
	t.deepEqual(
		await eventToMessage({
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: `I'm just <a href="https://matrix.to/#/!BnKuBPCvyfOkhcUjEu:cadence.moe?via=cadence.moe">worm-farm</a> testing channel mentions`
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
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "I'm just <#1100319550446252084> testing channel mentions",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: mentioning bridged rooms works (plaintext body)", async t => {
	t.deepEqual(
		await eventToMessage({
			content: {
				msgtype: "m.text",
				body: `I'm just https://matrix.to/#/!BnKuBPCvyfOkhcUjEu:cadence.moe?via=cadence.moe testing channel mentions`
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
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "I'm just <#1100319550446252084> testing channel mentions",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: mentioning bridged rooms by alias works", async t => {
	let called = 0
	t.deepEqual(
		await eventToMessage({
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: `I'm just <a href="https://matrix.to/#/%23worm-farm%3Acadence.moe?via=cadence.moe">worm-farm</a> testing channel mentions`
			},
			event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOU",
			origin_server_ts: 1688301929913,
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
			sender: "@cadence:cadence.moe",
			type: "m.room.message",
			unsigned: {
				age: 405299
			}
		}, {}, {
			api: {
				async getAlias(alias) {
					called++
					t.equal(alias, "#worm-farm:cadence.moe")
					return "!BnKuBPCvyfOkhcUjEu:cadence.moe"
				}
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "I'm just <#1100319550446252084> testing channel mentions",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
	t.equal(called, 1)
})

test("event2message: mentioning bridged rooms by alias works (plaintext body)", async t => {
	let called = 0
	t.deepEqual(
		await eventToMessage({
			content: {
				msgtype: "m.text",
				body: `I'm just https://matrix.to/#/#worm-farm:cadence.moe?via=cadence.moe testing channel mentions`
			},
			event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOU",
			origin_server_ts: 1688301929913,
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
			sender: "@cadence:cadence.moe",
			type: "m.room.message",
			unsigned: {
				age: 405299
			}
		}, {}, {
			api: {
				async getAlias(alias) {
					called++
					t.equal(alias, "#worm-farm:cadence.moe")
					return "!BnKuBPCvyfOkhcUjEu:cadence.moe"
				}
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "I'm just <#1100319550446252084> testing channel mentions",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
	t.equal(called, 1)
})

test("event2message: mentioning bridged rooms by alias skips the link when alias is unresolvable", async t => {
	let called = 0
	t.deepEqual(
		await eventToMessage({
			content: {
				msgtype: "m.text",
				body: `I'm just https://matrix.to/#/#worm-farm:cadence.moe?via=cadence.moe and https://matrix.to/#/!BnKuBPCvyfOkhcUjEu:cadence.moe?via=cadence.moe testing channel mentions`
			},
			event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOU",
			origin_server_ts: 1688301929913,
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
			sender: "@cadence:cadence.moe",
			type: "m.room.message",
			unsigned: {
				age: 405299
			}
		}, {}, {
			api: {
				async getAlias(alias) {
					called++
					throw new MatrixServerError("Alias doesn't exist or something")
				}
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "I'm just <https://matrix.to/#/#worm-farm:cadence.moe?via=cadence.moe> and <#1100319550446252084> testing channel mentions",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
	t.equal(called, 1)
})

test("event2message: mentioning known bridged events works (plaintext body)", async t => {
	t.deepEqual(
		await eventToMessage({
			content: {
				msgtype: "m.text",
				body: "it was uploaded earlier in https://matrix.to/#/!CzvdIdUQXgUjDVKxeU:cadence.moe/$zXSlyI78DQqQwwfPUSzZ1b-nXzbUrCDljJgnGDdoI10?via=cadence.moe, take a look!"
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
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "it was uploaded earlier in https://discord.com/channels/497159726455455754/497161350934560778/1141619794500649020, take a look!",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: mentioning known bridged events works (partially formatted body)", async t => {
	t.deepEqual(
		await eventToMessage({
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: `it was uploaded earlier in https://matrix.to/#/!CzvdIdUQXgUjDVKxeU:cadence.moe/$zXSlyI78DQqQwwfPUSzZ1b-nXzbUrCDljJgnGDdoI10?via=cadence.moe`
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
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "it was uploaded earlier in https://discord.com/channels/497159726455455754/497161350934560778/1141619794500649020",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: mentioning known bridged events works (formatted body)", async t => {
	t.deepEqual(
		await eventToMessage({
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: `it was uploaded earlier in <a href="https://matrix.to/#/!CzvdIdUQXgUjDVKxeU:cadence.moe/$zXSlyI78DQqQwwfPUSzZ1b-nXzbUrCDljJgnGDdoI10?via=cadence.moe">amanda-spam</a>`
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
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "it was uploaded earlier in https://discord.com/channels/497159726455455754/497161350934560778/1141619794500649020",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: mentioning known bridged events followed by line break and user mention works (partially formatted body)", async t => {
	t.deepEqual(
		await eventToMessage({
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: `https://matrix.to/#/!CzvdIdUQXgUjDVKxeU:cadence.moe/$zXSlyI78DQqQwwfPUSzZ1b-nXzbUrCDljJgnGDdoI10?via=cadence.moe<a href="https://matrix.to/#/@_ooye_extremity:cadence.moe">extremity</a>`
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
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "https://discord.com/channels/497159726455455754/497161350934560778/1141619794500649020<@114147806469554185>",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: mentioning unknown bridged events can approximate with timestamps", async t => {
	let called = 0
	t.deepEqual(
		await eventToMessage({
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: `it was uploaded years ago in <a href="https://matrix.to/#/!CzvdIdUQXgUjDVKxeU:cadence.moe/$zpzx6ABetMl8BrpsFbdZ7AefVU1Y_-t97bJRJM2JyW0?via=cadence.moe">amanda-spam</a>`
			},
			event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOU",
			origin_server_ts: 1688301929913,
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
			sender: "@cadence:cadence.moe",
			type: "m.room.message",
			unsigned: {
				age: 405299
			}
		}, {}, {
			api: {
				async getEvent(roomID, eventID) {
					called++
					t.equal(roomID, "!CzvdIdUQXgUjDVKxeU:cadence.moe")
					t.equal(eventID, "$zpzx6ABetMl8BrpsFbdZ7AefVU1Y_-t97bJRJM2JyW0")
					return {
						origin_server_ts: 1599813121000
					}
				}
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "it was uploaded years ago in https://discord.com/channels/497159726455455754/497161350934560778/753895613661184000",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
	t.equal(called, 1, "getEvent should be called once")
})

test("event2message: mentioning events falls back to original link when server doesn't know about it", async t => {
	let called = 0
	t.deepEqual(
		await eventToMessage({
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: `it was uploaded years ago in <a href="https://matrix.to/#/!CzvdIdUQXgUjDVKxeU:cadence.moe/$zpzx6ABetMl8BrpsFbdZ7AefVU1Y_-t97bJRJM2JyW1?via=cadence.moe">amanda-spam</a>`
			},
			event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOV",
			origin_server_ts: 1688301929913,
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
			sender: "@cadence:cadence.moe",
			type: "m.room.message",
			unsigned: {
				age: 405299
			}
		}, {}, {
			api: {
				async getEvent(roomID, eventID) {
					called++
					t.equal(roomID, "!CzvdIdUQXgUjDVKxeU:cadence.moe")
					t.equal(eventID, "$zpzx6ABetMl8BrpsFbdZ7AefVU1Y_-t97bJRJM2JyW1")
					throw new Error("missing event or something")
				}
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "it was uploaded years ago in [amanda-spam](<https://matrix.to/#/!CzvdIdUQXgUjDVKxeU:cadence.moe/$zpzx6ABetMl8BrpsFbdZ7AefVU1Y_-t97bJRJM2JyW1?via=cadence.moe>)",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
	t.equal(called, 1, "getEvent should be called once")
})

test("event2message: mentioning events falls back to original link when the channel-guild isn't in cache", async t => {
	t.equal(select("channel_room", "channel_id", {room_id: "!tnedrGVYKFNUdnegvf:tchncs.de"}).pluck().get(), "489237891895768942", "consistency check: this channel-room needs to be in the database for the test to make sense")
	t.equal(discord.channels.get("489237891895768942"), undefined, "consistency check: this channel needs to not be in client cache for the test to make sense")
	t.deepEqual(
		await eventToMessage({
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: `it was uploaded years ago in <a href="https://matrix.to/#/!tnedrGVYKFNUdnegvf:tchncs.de/$zpzx6ABetMl8BrpsFbdZ7AefVU1Y_-t97bJRJM2JyW2?via=tchncs.de">ex-room-doesnt-exist-any-more</a>`
			},
			event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOX",
			origin_server_ts: 1688301929913,
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
			sender: "@cadence:cadence.moe",
			type: "m.room.message",
			unsigned: {
				age: 405299
			}
		}, {}, {
			api: {
				/* c8 ignore next 3 */
				async getEvent() {
					t.fail("getEvent should not be called because it should quit early due to no channel-guild")
				}
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "it was uploaded years ago in [ex-room-doesnt-exist-any-more](<https://matrix.to/#/!tnedrGVYKFNUdnegvf:tchncs.de/$zpzx6ABetMl8BrpsFbdZ7AefVU1Y_-t97bJRJM2JyW2?via=tchncs.de>)",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: link to event in an unknown room (href link)", async t => {
	t.deepEqual(
		await eventToMessage({
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: 'ah yeah, here\'s where the bug was reported: <a href="https://matrix.to/#/!QtykxKocfZaZOUrTwp:matrix.org/$1542477546853947KGhZL:matrix.org">https://matrix.to/#/!QtykxKocfZaZOUrTwp:matrix.org/$1542477546853947KGhZL:matrix.org</a>'
			},
			event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOU",
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
			sender: "@cadence:cadence.moe",
			type: "m.room.message",
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "ah yeah, here's where the bug was reported: <https://matrix.to/#/!QtykxKocfZaZOUrTwp:matrix.org/$1542477546853947KGhZL:matrix.org>",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: link to event in an unknown room (bare link)", async t => {
	t.deepEqual(
		await eventToMessage({
			content: {
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: "PK API failure, tho idk how you'd handle that https://matrix.to/#/!SeYQChwXBnZaQLoZfI:sleeping.town/$AAPZ56B2P7TfROYPTtuoJjgvXmaBM11NoNceM8GCJ7s",
				msgtype: "m.text"
			},
			sender: "@cadence:cadence.moe",
			type: "m.room.message",
			event_id: "$-UwntiHseGfch1GMjTROIgDbgLGIOwMx0vJdTi-dmok",
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe"
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "PK API failure, tho idk how you'd handle that <https://matrix.to/#/!SeYQChwXBnZaQLoZfI:sleeping.town/$AAPZ56B2P7TfROYPTtuoJjgvXmaBM11NoNceM8GCJ7s>",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: link to event in an unknown room (plaintext)", async t => {
	t.deepEqual(
		await eventToMessage({
			content: {
				msgtype: "m.text",
				body: "ah yeah, here's where the bug was reported: https://matrix.to/#/!QtykxKocfZaZOUrTwp:matrix.org/$1542477546853947KGhZL:matrix.org"
			},
			event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOU",
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
			sender: "@cadence:cadence.moe",
			type: "m.room.message",
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "ah yeah, here's where the bug was reported: <https://matrix.to/#/!QtykxKocfZaZOUrTwp:matrix.org/$1542477546853947KGhZL:matrix.org>",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: colon after mentions is stripped", async t => {
	t.deepEqual(
		await eventToMessage({
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: `<a href="https://matrix.to/#/@_ooye_extremity:cadence.moe">extremity</a>: hey, I'm just <a href="https://matrix.to/#/@rnl:cadence.moe">▲</a>: testing mentions`
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
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "<@114147806469554185> hey, I'm just [@▲](<https://matrix.to/#/@rnl:cadence.moe>) testing mentions",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: caches the member if the member is not known", async t => {
	let called = 0
	t.deepEqual(
		await eventToMessage({
			content: {
				body: "testing the member state cache",
				msgtype: "m.text"
			},
			event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOU",
			origin_server_ts: 1688301929913,
			room_id: "!qzDBLKlildpzrrOnFZ:cadence.moe",
			sender: "@should_be_newly_cached:cadence.moe",
			type: "m.room.message",
			unsigned: {
				age: 405299
			}
		}, {}, {
			api: {
				getStateEvent: async (roomID, type, stateKey) => {
					called++
					t.equal(roomID, "!qzDBLKlildpzrrOnFZ:cadence.moe")
					t.equal(type, "m.room.member")
					t.equal(stateKey, "@should_be_newly_cached:cadence.moe")
					return {
						avatar_url: "mxc://cadence.moe/this_is_the_avatar"
					}
				}
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "should_be_newly_cached",
				content: "testing the member state cache",
				avatar_url: "https://bridge.example.org/download/matrix/cadence.moe/this_is_the_avatar",
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)

	t.deepEqual(select("member_cache", ["avatar_url", "displayname", "mxid"], {room_id: "!qzDBLKlildpzrrOnFZ:cadence.moe"}).all(), [
		{avatar_url: "mxc://cadence.moe/this_is_the_avatar", displayname: null, mxid: "@should_be_newly_cached:cadence.moe"}
	])
	t.equal(called, 1, "getStateEvent should be called once")
})

test("event2message: does not cache the member if the room is not known", async t => {
	let called = 0
	t.deepEqual(
		await eventToMessage({
			content: {
				body: "testing the member state cache",
				msgtype: "m.text"
			},
			event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOU",
			origin_server_ts: 1688301929913,
			room_id: "!not_real:cadence.moe",
			sender: "@should_not_be_cached:cadence.moe",
			type: "m.room.message",
			unsigned: {
				age: 405299
			}
		}, {}, {
			api: {
				getStateEvent: async (roomID, type, stateKey) => {
					called++
					t.equal(roomID, "!not_real:cadence.moe")
					t.equal(type, "m.room.member")
					t.equal(stateKey, "@should_not_be_cached:cadence.moe")
					return {
						avatar_url: "mxc://cadence.moe/this_is_the_avatar"
					}
				}
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "should_not_be_cached",
				content: "testing the member state cache",
				avatar_url: "https://bridge.example.org/download/matrix/cadence.moe/this_is_the_avatar",
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)

	t.deepEqual(select("member_cache", ["avatar_url", "displayname", "mxid"], {room_id: "!not_real:cadence.moe"}).all(), [])
	t.equal(called, 1, "getStateEvent should be called once")
})

test("event2message: skips caching the member if the member does not exist, somehow", async t => {
	let called = 0
	t.deepEqual(
		await eventToMessage({
			content: {
				body: "should honestly never happen",
				msgtype: "m.text"
			},
			event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOU",
			origin_server_ts: 1688301929913,
			room_id: "!not_real:cadence.moe",
			sender: "@not_real:cadence.moe",
			type: "m.room.message",
			unsigned: {
				age: 405299
			}
		}, {}, {
			api: {
				getStateEvent: async (roomID, type, stateKey) => {
					called++
					t.equal(roomID, "!not_real:cadence.moe")
					t.equal(type, "m.room.member")
					t.equal(stateKey, "@not_real:cadence.moe")
					throw new MatrixServerError("State event doesn't exist or something")
				}
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "not_real",
				content: "should honestly never happen",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
	t.deepEqual(select("member_cache", ["avatar_url", "displayname", "mxid"], {room_id: "!not_real:cadence.moe"}).all(), [])
	t.equal(called, 1, "getStateEvent should be called once")
})

test("event2message: overly long usernames are shifted into the message content", async t => {
	let called = 0
	t.deepEqual(
		await eventToMessage({
			content: {
				body: "testing the member state cache",
				msgtype: "m.text"
			},
			event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOU",
			origin_server_ts: 1688301929913,
			room_id: "!cqeGDbPiMFAhLsqqqq:cadence.moe",
			sender: "@should_be_newly_cached_2:cadence.moe",
			type: "m.room.message",
			unsigned: {
				age: 405299
			}
		}, {}, {
			api: {
				getStateEvent: async (roomID, type, stateKey) => {
					called++
					t.equal(roomID, "!cqeGDbPiMFAhLsqqqq:cadence.moe")
					t.equal(type, "m.room.member")
					t.equal(stateKey, "@should_be_newly_cached_2:cadence.moe")
					return {
						displayname: "I am BLACK I am WHITE I am SHORT I am LONG I am EVERYTHING YOU THINK IS IMPORTANT and I DON'T MATTER",
					}
				}
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "I am BLACK I am WHITE I am SHORT I am LONG I am EVERYTHING YOU THINK IS",
				content: "**IMPORTANT and I DON'T MATTER**\ntesting the member state cache",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
	t.deepEqual(select("member_cache", ["avatar_url", "displayname", "mxid"], {room_id: "!cqeGDbPiMFAhLsqqqq:cadence.moe"}).all(), [
		{avatar_url: null, displayname: "I am BLACK I am WHITE I am SHORT I am LONG I am EVERYTHING YOU THINK IS IMPORTANT and I DON'T MATTER", mxid: "@should_be_newly_cached_2:cadence.moe"}
	])
	t.equal(called, 1, "getStateEvent should be called once")
})

test("event2message: overly long usernames are not treated specially when the msgtype is m.emote", async t => {
	t.deepEqual(
		await eventToMessage({
			content: {
				body: "looks at the start of the message",
				msgtype: "m.emote"
			},
			event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOU",
			origin_server_ts: 1688301929913,
			room_id: "!cqeGDbPiMFAhLsqqqq:cadence.moe",
			sender: "@should_be_newly_cached_2:cadence.moe",
			type: "m.room.message",
			unsigned: {
				age: 405299
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "I am BLACK I am WHITE I am SHORT I am LONG I am EVERYTHING YOU THINK IS",
				content: "\\* I am BLACK I am WHITE I am SHORT I am LONG I am EVERYTHING YOU THINK IS IMPORTANT and I DON'T MATTER looks at the start of the message",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: text attachments work", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			content: {
				body: "chiki-powerups.txt",
				info: {
					size: 971,
					mimetype: "text/plain"
				},
				msgtype: "m.file",
				url: "mxc://cadence.moe/zyThGlYQxvlvBVbVgKDDbiHH"
			},
			sender: "@cadence:cadence.moe",
			event_id: "$c2WVyP6KcfAqh5imOa8e0xzt2C8JTR-cWbEd3GargEQ",
			room_id: "!BnKuBPCvyfOkhcUjEu:cadence.moe"
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "",
				avatar_url: "https://bridge.example.org/download/matrix/cadence.moe/azCAhThKTojXSZJRoWwZmhvU",
				attachments: [{id: "0", filename: "chiki-powerups.txt"}],
				pendingFiles: [{name: "chiki-powerups.txt", mxc: "mxc://cadence.moe/zyThGlYQxvlvBVbVgKDDbiHH"}]
			}]
		}
	)
})

test("event2message: image attachments work", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				body: "cool cat.png",
				filename: "cool cat.png",
				info: {
					size: 43170,
					mimetype: "image/png",
					w: 480,
					h: 480,
					"xyz.amorgan.blurhash": "URTHsVaTpdj2eKZgkkkXp{pHl7feo@lSl9Z$"
				},
				msgtype: "m.image",
				url: "mxc://cadence.moe/IvxVJFLEuksCNnbojdSIeEvn"
			},
			event_id: "$CXQy3Wmg1A-gL_xAesC1HQcQTEXwICLdSwwUx55FBTI",
			room_id: "!BnKuBPCvyfOkhcUjEu:cadence.moe"
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "",
				avatar_url: "https://bridge.example.org/download/matrix/cadence.moe/azCAhThKTojXSZJRoWwZmhvU",
				attachments: [{id: "0", filename: "cool cat.png"}],
				pendingFiles: [{name: "cool cat.png", mxc: "mxc://cadence.moe/IvxVJFLEuksCNnbojdSIeEvn"}]
			}]
		}
	)
})

test("event2message: image attachments can have a plaintext caption", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				body: "Cat emoji surrounded by pink hearts",
				filename: "cool cat.png",
				info: {
					size: 43170,
					mimetype: "image/png",
					w: 480,
					h: 480,
					"xyz.amorgan.blurhash": "URTHsVaTpdj2eKZgkkkXp{pHl7feo@lSl9Z$"
				},
				msgtype: "m.image",
				url: "mxc://cadence.moe/IvxVJFLEuksCNnbojdSIeEvn"
			},
			event_id: "$CXQy3Wmg1A-gL_xAesC1HQcQTEXwICLdSwwUx55FBTI",
			room_id: "!BnKuBPCvyfOkhcUjEu:cadence.moe"
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "Cat emoji surrounded by pink hearts",
				avatar_url: "https://bridge.example.org/download/matrix/cadence.moe/azCAhThKTojXSZJRoWwZmhvU",
				attachments: [{id: "0", filename: "cool cat.png"}],
				pendingFiles: [{name: "cool cat.png", mxc: "mxc://cadence.moe/IvxVJFLEuksCNnbojdSIeEvn"}],
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: image attachments can have a formatted caption", async t => {
	t.deepEqual(
		await eventToMessage({
			content: {
				body: "this event has `formatting`",
				filename: "5740.jpg",
				format: "org.matrix.custom.html",
				formatted_body: "this event has <code>formatting</code>",
				info: {
					h: 1340,
					mimetype: "image/jpeg",
					size: 226689,
					thumbnail_info: {
						h: 670,
						mimetype: "image/jpeg",
						size: 80157,
						w: 540
					},
					thumbnail_url: "mxc://thomcat.rocks/XhLsOCDBYyearsLQgUUrbAvw",
					w: 1080,
					"xyz.amorgan.blurhash": "KHJQG*55ic-.}?0M58J.9v"
				},
				msgtype: "m.image",
				url: "mxc://thomcat.rocks/RTHsXmcMPXmuHqVNsnbKtRbh"
			},
			origin_server_ts: 1740607766895,
			sender: "@cadence:cadence.moe",
			type: "m.room.message",
			event_id: "$NqNqVgukiQm1nynm9vIr9FIq31hZpQ3udOd7cBIW46U",
			room_id: "!BnKuBPCvyfOkhcUjEu:cadence.moe"
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "this event has `formatting`",
				avatar_url: "https://bridge.example.org/download/matrix/cadence.moe/azCAhThKTojXSZJRoWwZmhvU",
				attachments: [{id: "0", filename: "5740.jpg"}],
				pendingFiles: [{name: "5740.jpg", mxc: "mxc://thomcat.rocks/RTHsXmcMPXmuHqVNsnbKtRbh"}],
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: encrypted image attachments work", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				info: {
					mimetype: "image/png",
					size: 105691,
					w: 1192,
					h: 309,
					"xyz.amorgan.blurhash": "U17USN~q9FtQ-;Rjxuj[9FIUoMM|-=WB9Ft7"
				},
				msgtype: "m.image",
				body: "image.png",
				file: {
					v: "v2",
					key: {
						alg: "A256CTR",
						ext: true,
						k: "QTo-oMPnN1Rbc7vBFg9WXMgoctscdyxdFEIYm8NYceo",
						key_ops: ["encrypt", "decrypt"],
						kty: "oct"
					},
					iv: "Va9SHZpIn5kAAAAAAAAAAA",
					hashes: {
						sha256: "OUZqZFBcANFt42iAKET9YXfWMCdT0BX7QO0Eyk9q4Js"
					},
					url: "mxc://heyquark.com/LOGkUTlVFrqfiExlGZNgCJJX",
					mimetype: "image/png"
				}
			},
			event_id: "$JNhONhXO-5jrztZz8b7mbTMJasbU78TwQr4tog-3Mnk",
			room_id: "!BnKuBPCvyfOkhcUjEu:cadence.moe"
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "",
				avatar_url: "https://bridge.example.org/download/matrix/cadence.moe/azCAhThKTojXSZJRoWwZmhvU",
				attachments: [{id: "0", filename: "image.png"}],
				pendingFiles: [{
					name: "image.png",
					mxc: "mxc://heyquark.com/LOGkUTlVFrqfiExlGZNgCJJX",
					key: "QTo-oMPnN1Rbc7vBFg9WXMgoctscdyxdFEIYm8NYceo",
					iv: "Va9SHZpIn5kAAAAAAAAAAA"
				}]
			}]
		}
	)
})

test("event2message: evil encrypted image attachment works", async t => {
	t.deepEqual(
		await eventToMessage({
			sender: "@austin:tchncs.de",
			type: "m.room.message",
			content: {
				body: "Screenshot 2025-06-29 at 13.36.46.png",
				file: {
					hashes: {
						sha256: "Vh1apd8wSFu/BpUdQbIrKUzFB0Uu+l1octgZL+aVGTQ"
					},
					iv: "sd33K7pSZNMAAAAAAAAAAA",
					key: {
						alg: "A256CTR",
						ext: true,
						k: "-nyqk1eqI-g-ND59P9qHp310-Qyc2A5gSAYm1BxopSg",
						key_ops: [
							"encrypt",
							"decrypt"
						],
						kty: "oct"
					},
					url: "mxc://tchncs.de/eac5f83fa97cd74062daf75dfa04d6e5356897281939377544214085632",
					v: "v2"
				},
				info: {
					h: 682,
					mimetype: "image/png",
					"org.matrix.msc4230.is_animated": false,
					size: 1813154,
					thumbnail_file: {
						hashes: {
							sha256: "o3xykQwfsTUf5Y8qP5fjT7qBv5lAT3rtkmPpise5eQw"
						},
						iv: "SNxIZsJkju4AAAAAAAAAAA",
						key: {
							alg: "A256CTR",
							ext: true,
							k: "CcibYjzzSDexOWBbcBh_kCDiLibg8vUZthz5CnxV0es",
							key_ops: [
								"encrypt",
								"decrypt"
							],
							kty: "oct"
						},
						url: "mxc://tchncs.de/ecd811d913ed1b240ebfc81517a5de2c3a1e9d401939377537079574528",
						v: "v2"
					},
					thumbnail_info: {
						h: 600,
						mimetype: "image/png",
						size: 451773,
						w: 507
					},
					thumbnail_url: null,
					w: 577,
					"xyz.amorgan.blurhash": "TqN1Ais=t1~qRjWFxURiWCM{ofof"
				},
				"m.mentions": {},
				msgtype: "m.image",
				url: null
			},
			event_id: "$UKMbzTlqlyLYN78utVEtiivABFvOe39nx5trHwqNmeQ",
			room_id: "!iSyXgNxQcEuXoXpsSn:pussthecat.org"
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "Austin Huang",
				content: "",
				avatar_url: "https://bridge.example.org/download/matrix/tchncs.de/090a2b5e07eed2f71e84edad5207221e6c8f8b8e",
				attachments: [{id: "0", filename: "Screenshot 2025-06-29 at 13.36.46.png"}],
				pendingFiles: [{
					name: "Screenshot 2025-06-29 at 13.36.46.png",
					mxc: "mxc://tchncs.de/eac5f83fa97cd74062daf75dfa04d6e5356897281939377544214085632",
					key: "-nyqk1eqI-g-ND59P9qHp310-Qyc2A5gSAYm1BxopSg",
					iv: "sd33K7pSZNMAAAAAAAAAAA"
				}]
			}]
		}
	)
})

test("event2message: stickers work", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.sticker",
			sender: "@cadence:cadence.moe",
			content: {
				body: "get_real2",
				url: "mxc://cadence.moe/NyMXQFAAdniImbHzsygScbmN",
				info: {
					w: 320,
					h: 298,
					mimetype: "image/gif",
					size: 331394,
					thumbnail_info: {
						w: 320,
						h: 298,
						mimetype: "image/gif",
						size: 331394
					},
					thumbnail_url: "mxc://cadence.moe/NyMXQFAAdniImbHzsygScbmN"
				}
			},
			event_id: "$PdI-KjdQ8Z_Tb4x9_7wKRPZCsrrXym4BXtbAPekypuM",
			room_id: "!BnKuBPCvyfOkhcUjEu:cadence.moe"
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "",
				avatar_url: "https://bridge.example.org/download/matrix/cadence.moe/azCAhThKTojXSZJRoWwZmhvU",
				attachments: [{id: "0", filename: "get_real2.gif"}],
				pendingFiles: [{name: "get_real2.gif", mxc: "mxc://cadence.moe/NyMXQFAAdniImbHzsygScbmN"}]
			}]
		}
	)
})

test("event2message: stickers fetch mimetype from server when mimetype not provided", async t => {
	let called = 0
	t.deepEqual(
		await eventToMessage({
			type: "m.sticker",
			sender: "@cadence:cadence.moe",
			content: {
				body: "YESYESYES",
				url: "mxc://cadence.moe/ybOWQCaXysnyUGuUCaQlTGJf"
			},
			event_id: "$mL-eEVWCwOvFtoOiivDP7gepvf-fTYH6_ioK82bWDI0",
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe"
		}, {}, {
			api: {
				async getMedia(mxc, options) {
					called++
					t.equal(mxc, "mxc://cadence.moe/ybOWQCaXysnyUGuUCaQlTGJf")
					t.equal(options.method, "HEAD")
					return {
						status: 200,
						headers: new Map([
							["content-type", "image/gif"]
						])
					}
				}
			}
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "",
				avatar_url: undefined,
				attachments: [{id: "0", filename: "YESYESYES.gif"}],
				pendingFiles: [{name: "YESYESYES.gif", mxc: "mxc://cadence.moe/ybOWQCaXysnyUGuUCaQlTGJf"}]
			}]
		}
	)
	t.equal(called, 1, "sticker headers should be fetched")
})

test("event2message: stickers with unknown mimetype are not allowed", async t => {
	let called = 0
	try {
		await eventToMessage({
			type: "m.sticker",
			sender: "@cadence:cadence.moe",
			content: {
				body: "something",
				url: "mxc://cadence.moe/ybOWQCaXysnyUGuUCaQlTGJe"
			},
			event_id: "$mL-eEVWCwOvFtoOiivDP7gepvf-fTYH6_ioK82bWDI0",
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe"
		}, {}, {
			api: {
				async getMedia(mxc, options) {
					called++
					t.equal(mxc, "mxc://cadence.moe/ybOWQCaXysnyUGuUCaQlTGJe")
					t.equal(options.method, "HEAD")
					return {
						status: 404,
						headers: new Map([
							["content-type", "application/json"]
						])
					}
				}
			}
		})
		/* c8 ignore next */
		t.fail("should throw an error")
	} catch (e) {
		t.match(e.toString(), "mimetype")
	}
})

test("event2message: static emojis work", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: ":hippo:",
				format: "org.matrix.custom.html",
				formatted_body: '<img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/qWmbXeRspZRLPcjseyLmeyXC\" title=\":hippo:\" alt=\":hippo:\">'
			},
			event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOU",
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe"
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "<:hippo:230201364309868544>",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: emojis in other servers are reused if they have the same title text", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: ":hippo:",
				format: "org.matrix.custom.html",
				formatted_body: '<img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/123456\" title=\":hippo:\" alt=\":hippo:\">'
			},
			event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOU",
			room_id: "!CzvdIdUQXgUjDVKxeU:cadence.moe"
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "<:hippo:230201364309868544>",
				avatar_url: "https://bridge.example.org/download/matrix/cadence.moe/azCAhThKTojXSZJRoWwZmhvU",
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: animated emojis work", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: ":hippo:",
				format: "org.matrix.custom.html",
				formatted_body: '<img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/WbYqNlACRuicynBfdnPYtmvc\" title=\":hipposcope:\" alt=\":hipposcope:\">'
			},
			event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOU",
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe"
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "<a:hipposcope:393635038903926784>",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: unknown emojis in the middle are linked", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: 'a <img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/RLMgJGfgTPjIQtvvWZsYjhjy\" title=\":ms_robot_grin:\" alt=\":ms_robot_grin:\"> b'
			},
			event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOU",
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe"
		}),
		{
			ensureJoined: [],
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "a [:ms_robot_grin:](https://bridge.example.org/download/matrix/cadence.moe/RLMgJGfgTPjIQtvvWZsYjhjy) b",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}]
		}
	)
})

test("event2message: guessed @mentions in plaintext may join members to mention", async t => {
	let called = 0
	const subtext = {
		user: {
			id: "321876634777218072",
			username: "subtextual",
			global_name: "subtext",
			discriminator: "0"
		}
	}
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: "hey @subtext, what food would you like to order?"
			},
			event_id: "$u5gSwSzv_ZQS3eM00mnTBCor8nx_A_AwuQz7e59PZk8",
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe"
		}, {
			id: "112760669178241024"
		}, {
			snow: {
				guild: {
					async searchGuildMembers(guildID, options) {
						called++
						t.equal(guildID, "112760669178241024")
						t.deepEqual(options, {query: "subtext"})
						return [subtext]
					}
				}
			}
		}),
		{
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "hey <@321876634777218072>, what food would you like to order?",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}],
			ensureJoined: [subtext.user]
		}
	)
	t.equal(called, 1, "searchGuildMembers should be called once")
})

test("event2message: guessed @mentions in formatted body may join members to mention", async t => {
	let called = 0
	const subtext = {
		user: {
			id: "321876634777218072",
			username: "subtextual",
			global_name: "subtext",
			discriminator: "0"
		}
	}
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: "<strong><em>HEY @SUBTEXT, WHAT FOOD WOULD YOU LIKE TO ORDER??</em></strong>"
			},
			event_id: "$u5gSwSzv_ZQS3eM00mnTBCor8nx_A_AwuQz7e59PZk8",
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe"
		}, {
			id: "112760669178241024"
		}, {
			snow: {
				guild: {
					async searchGuildMembers(guildID, options) {
						called++
						t.equal(guildID, "112760669178241024")
						t.deepEqual(options, {query: "SUBTEXT"})
						return [subtext]
					}
				}
			}
		}),
		{
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "**_HEY <@321876634777218072>, WHAT FOOD WOULD YOU LIKE TO ORDER??_**",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}],
			ensureJoined: [subtext.user]
		}
	)
	t.equal(called, 1, "searchGuildMembers should be called once")
})

test("event2message: guessed @mentions feature will not activate on links or code", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: "wrong body @subtext wrong body",
				format: "org.matrix.custom.html",
				formatted_body: 'in link <a href="https://example.com/social/@subtext">view timeline</a>'
					+ ' in autolink https://example.com/social/@subtext'
					+ ' in pre-code <pre><code>@subtext</code></pre>'
			},
			event_id: "$u5gSwSzv_ZQS3eM00mnTBCor8nx_A_AwuQz7e59PZk8",
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe"
		}, {}, {
			snow: {
				guild: {
					/* c8 ignore next 4 */
					async searchGuildMembers() {
						t.fail("the feature activated when it wasn't supposed to")
						return []
					}
				}
			}
		}),
		{
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "in link [view timeline](https://example.com/social/@subtext) in autolink https://example.com/social/@subtext in pre-code```\n@subtext\n```",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}],
			ensureJoined: []
		}
	)
})

test("event2message: guessed @mentions work with other matrix bridge old users", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: "extremity#0: zenosia#0717:  back me up on this sentiment, if not necessarily the phrasing",
				format: "org.matrix.custom.html",
			formatted_body: "<a href=\"https://matrix.to/#/@_discord_114147806469554185:cadence.moe\">extremity#0</a>: <a href=\"https://matrix.to/#/@_discordpuppet_176943908762006200:cadence.moe\">zenosia#0717</a>:  back me up on this sentiment, if not necessarily the phrasing"
			},
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
			event_id: "$SiXetU9h9Dg-M9Frcw_C6ahnoXZ3QPZe3MVJR5tcB9A"
		}),
		{
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "<@114147806469554185> <@176943908762006200> back me up on this sentiment, if not necessarily the phrasing",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}],
			ensureJoined: [] // we already think it worked on Matrix side due to the pill, so no need for the OOYE sim user to join the room to indicate success.
		}
	)
})

test("event2message: @room converts to @everyone and is allowed when the room doesn't restrict who can use it (plaintext body)", async t => {
	let called = 0
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: "@room dinner's ready",
			},
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
			event_id: "$SiXetU9h9Dg-M9Frcw_C6ahnoXZ3QPZe3MVJR5tcB9A"
		}, data.guild.general, {
			api: {
				getStateEvent(roomID, type, key) {
					called++
					t.equal(roomID, "!kLRqKKUQXcibIMtOpl:cadence.moe")
					t.equal(type, "m.room.power_levels")
					t.equal(key, "")
					return {
						users: {},
						notifications: {
							room: 0
						}
					}
				}
			}
		}),
		{
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "@everyone dinner's ready",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles", "everyone"]
				}
			}],
			ensureJoined: []
		}
	)
})

test("event2message: @room converts to @everyone but is not allowed when the room restricts who can use it", async t => {
	let called = 0
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: "@room dinner's ready"
			},
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
			event_id: "$SiXetU9h9Dg-M9Frcw_C6ahnoXZ3QPZe3MVJR5tcB9A"
		}, data.guild.general, {
			api: {
				getStateEvent(roomID, type, key) {
					called++
					t.equal(roomID, "!kLRqKKUQXcibIMtOpl:cadence.moe")
					t.equal(type, "m.room.power_levels")
					t.equal(key, "")
					return {
						users: {},
						notifications: {
							room: 20
						}
					}
				}
			}
		}),
		{
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "@room dinner's ready",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}],
			ensureJoined: []
		}
	)
})

test("event2message: @room converts to @everyone and is allowed if the user has sufficient power to use it", async t => {
	let called = 0
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: "@room dinner's ready"
			},
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
			event_id: "$SiXetU9h9Dg-M9Frcw_C6ahnoXZ3QPZe3MVJR5tcB9A"
		}, data.guild.general, {
			api: {
				getStateEvent(roomID, type, key) {
					called++
					t.equal(roomID, "!kLRqKKUQXcibIMtOpl:cadence.moe")
					t.equal(type, "m.room.power_levels")
					t.equal(key, "")
					return {
						users: {
							"@cadence:cadence.moe": 20
						},
						notifications: {
							room: 20
						}
					}
				}
			}
		}),
		{
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "@everyone dinner's ready",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles", "everyone"]
				}
			}],
			ensureJoined: []
		}
	)
})

test("event2message: @room in the middle of a link is not converted", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: `<a href="https://github.com/@room/repositories">https://github.com/@room/repositories</a> https://github.com/@room/repositories`
			},
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
			event_id: "$SiXetU9h9Dg-M9Frcw_C6ahnoXZ3QPZe3MVJR5tcB9A"
		}),
		{
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "https://github.com/@room/repositories https://github.com/@room/repositories",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}],
			ensureJoined: []
		}
	)
})

test("event2message: table", async t => {
	t.deepEqual(
		await eventToMessage({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: {
				msgtype: "m.text",
				body: "wrong body",
				format: "org.matrix.custom.html",
				formatted_body: "content<table><thead><tr><th>Col 1</th><th>Col 2</th><th>Col 3</th></tr></thead><tbody><tr><th>Apple</th><td>Banana</td><td>Cherry</td></tr><tr><th>Aardvark</th><td>Bee</td><td>Crocodile</td></tr><tr><td>Argon</td><td>Boron</td><td>Carbon</td></tr></tbody></table>more content"
			},
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
			event_id: "$SiXetU9h9Dg-M9Frcw_C6ahnoXZ3QPZe3MVJR5tcB9A"
		}),
		{
			messagesToDelete: [],
			messagesToEdit: [],
			messagesToSend: [{
				username: "cadence [they]",
				content: "content```"
				+ "\nCol 1     Col 2   Col 3  "
				+ "\n---------------------------"
				+ "\nApple     Banana  Cherry "
				+ "\nAardvark  Bee     Crocodile"
				+ "\nArgon     Boron   Carbon   ```"
				+ "more content",
				avatar_url: undefined,
				allowed_mentions: {
					parse: ["users", "roles"]
				}
			}],
			ensureJoined: []
		}
	)
})

slow()("event2message: unknown emoji at the end is reuploaded as a sprite sheet", async t => {
	const messages = await eventToMessage({
		type: "m.room.message",
		sender: "@cadence:cadence.moe",
		content: {
			msgtype: "m.text",
			body: "wrong body",
			format: "org.matrix.custom.html",
			formatted_body: 'a b <img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/RLMgJGfgTPjIQtvvWZsYjhjy\" title=\":ms_robot_grin:\" alt=\":ms_robot_grin:\">'
		},
		event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOU",
		room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe"
	}, {}, {mxcDownloader: mockGetAndConvertEmoji})
	const testResult = {
		content: messages.messagesToSend[0].content,
		fileName: messages.messagesToSend[0].pendingFiles[0].name,
		fileContentStart: messages.messagesToSend[0].pendingFiles[0].buffer.subarray(0, 90).toString("base64")
	}
	t.deepEqual(testResult, {
		content: "a b",
		fileName: "emojis.png",
		fileContentStart: "iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAACXBIWXMAAAPoAAAD6AG1e1JrAAALoklEQVR4nM1ZaVBU2RU+LZSIGnAvFUtcRkSk6abpbkDH"
	})
})

slow()("event2message: known emoji from an unreachable server at the end is reuploaded as a sprite sheet", async t => {
	const messages = await eventToMessage({
		type: "m.room.message",
		sender: "@cadence:cadence.moe",
		content: {
			msgtype: "m.text",
			body: "wrong body",
			format: "org.matrix.custom.html",
			formatted_body: 'a b <img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/bZFuuUSEebJYXUMSxuuSuLTa\" title=\":emoji_from_unreachable_server:\" alt=\":emoji_from_unreachable_server:\">'
		},
		event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOU",
		room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe"
	}, {}, {mxcDownloader: mockGetAndConvertEmoji})
	const testResult = {
		content: messages.messagesToSend[0].content,
		fileName: messages.messagesToSend[0].pendingFiles[0].name,
		fileContentStart: messages.messagesToSend[0].pendingFiles[0].buffer.subarray(0, 90).toString("base64")
	}
	t.deepEqual(testResult, {
		content: "a b",
		fileName: "emojis.png",
		fileContentStart: "iVBORw0KGgoAAAANSUhEUgAAADAAAAAwCAYAAABXAvmHAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAOoUlEQVR4nM1aCXBbx3l+Eu8bN0CAuO+TAHGTFAmAJHgT"
	})
})

slow()("event2message: known and unknown emojis in the end are reuploaded as a sprite sheet", async t => {
	const messages = await eventToMessage({
		type: "m.room.message",
		sender: "@cadence:cadence.moe",
		content: {
			msgtype: "m.text",
			body: "wrong body",
			format: "org.matrix.custom.html",
			formatted_body: 'known unknown: <img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/qWmbXeRspZRLPcjseyLmeyXC\" title=\":hippo:\" alt=\":hippo:\"> <img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/wcouHVjbKJJYajkhJLsyeJAA\" title=\":ms_robot_dress:\" alt=\":ms_robot_dress:\"> and known unknown: <img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/WbYqNlACRuicynBfdnPYtmvc\" title=\":hipposcope:\" alt=\":hipposcope:\"> <img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/HYcztccFIPgevDvoaWNsEtGJ\" title=\":ms_robot_cat:\" alt=\":ms_robot_cat:\">'
		},
		event_id: "$g07oYSZFWBkxohNEfywldwgcWj1hbhDzQ1sBAKvqOOU",
		room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe"
	}, {}, {mxcDownloader: mockGetAndConvertEmoji})
	const testResult = {
		content: messages.messagesToSend[0].content,
		fileName: messages.messagesToSend[0].pendingFiles[0].name,
		fileContentStart: messages.messagesToSend[0].pendingFiles[0].buffer.subarray(0, 90).toString("base64")
	}
	t.deepEqual(testResult, {
		content: "known unknown: <:hippo:230201364309868544> [:ms_robot_dress:](https://bridge.example.org/download/matrix/cadence.moe/wcouHVjbKJJYajkhJLsyeJAA) and known unknown:",
		fileName: "emojis.png",
		fileContentStart: "iVBORw0KGgoAAAANSUhEUgAAAGAAAAAwCAYAAADuFn/PAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAeXRFWHRSYXcACklQVEMgcHJvZmlsZQogICAgICA0Ngoz"
	})
})

slow()("event2message: all unknown chess emojis are reuploaded as a sprite sheet", async t => {
	const messages = await eventToMessage({
		type: "m.room.message",
		sender: "@cadence:cadence.moe",
		content: {
			msgtype: "m.text",
			body: "testing :chess_good_move::chess_incorrect::chess_blund::chess_brilliant_move::chess_blundest::chess_draw_black::chess_good_move::chess_incorrect::chess_blund::chess_brilliant_move::chess_blundest::chess_draw_black:",
			format: "org.matrix.custom.html",
			formatted_body: "testing <img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/lHfmJpzgoNyNtYHdAmBHxXix\" title=\":chess_good_move:\" alt=\":chess_good_move:\"><img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/MtRdXixoKjKKOyHJGWLsWLNU\" title=\":chess_incorrect:\" alt=\":chess_incorrect:\"><img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/HXfFuougamkURPPMflTJRxGc\" title=\":chess_blund:\" alt=\":chess_blund:\"><img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/ikYKbkhGhMERAuPPbsnQzZiX\" title=\":chess_brilliant_move:\" alt=\":chess_brilliant_move:\"><img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/AYPpqXzVJvZdzMQJGjioIQBZ\" title=\":chess_blundest:\" alt=\":chess_blundest:\"><img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/UVuzvpVUhqjiueMxYXJiFEAj\" title=\":chess_draw_black:\" alt=\":chess_draw_black:\"><img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/lHfmJpzgoNyNtYHdAmBHxXix\" title=\":chess_good_move:\" alt=\":chess_good_move:\"><img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/MtRdXixoKjKKOyHJGWLsWLNU\" title=\":chess_incorrect:\" alt=\":chess_incorrect:\"><img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/HXfFuougamkURPPMflTJRxGc\" title=\":chess_blund:\" alt=\":chess_blund:\"><img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/ikYKbkhGhMERAuPPbsnQzZiX\" title=\":chess_brilliant_move:\" alt=\":chess_brilliant_move:\"><img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/AYPpqXzVJvZdzMQJGjioIQBZ\" title=\":chess_blundest:\" alt=\":chess_blundest:\"><img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/UVuzvpVUhqjiueMxYXJiFEAj\" title=\":chess_draw_black:\" alt=\":chess_draw_black:\">"
		},
		event_id: "$Me6iE8C8CZyrDEOYYrXKSYRuuh_25Jj9kZaNrf7LKr4",
		room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe"
	}, {}, {mxcDownloader: mockGetAndConvertEmoji})
	const testResult = {
		content: messages.messagesToSend[0].content,
		fileName: messages.messagesToSend[0].pendingFiles[0].name,
		fileContentStart: messages.messagesToSend[0].pendingFiles[0].buffer.subarray(0, 90).toString("base64")
	}
	t.deepEqual(testResult, {
		content: "testing",
		fileName: "emojis.png",
		fileContentStart: "iVBORw0KGgoAAAANSUhEUgAAAYAAAABgCAYAAAAU9KWJAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAGXRFWHRTb2Z0d2FyZQB3d3cuaW5rc2NhcGUub3Jnm+48"
	})
})
