const {test} = require("supertape")
const {messageToEvent} = require("./message-to-event")
const data = require("../../test/data")
const Ty = require("../../types")

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

test("message2event: simple plaintext", async t => {
	const events = await messageToEvent(data.message.simple_plaintext, data.guild.general, {})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.text",
		body: "ayy lmao"
	}])
})

test("message2event: simple plaintext with quotes", async t => {
	const events = await messageToEvent(data.message.simple_plaintext_with_quotes, data.guild.general, {})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.text",
		body: `then he said, "you and her aren't allowed in here!"`
	}])
})

test("message2event: simple user mention", async t => {
	const events = await messageToEvent(data.message.simple_user_mention, data.guild.general, {})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.text",
		body: "@crunch god: Tell me about Phil, renowned martial arts master and creator of the Chin Trick",
		format: "org.matrix.custom.html",
		formatted_body: '<a href="https://matrix.to/#/@_ooye_crunch_god:cadence.moe">@crunch god</a> Tell me about Phil, renowned martial arts master and creator of the Chin Trick'
	}])
})

test("message2event: simple room mention", async t => {
	const events = await messageToEvent(data.message.simple_room_mention, data.guild.general, {})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.text",
		body: "#main",
		format: "org.matrix.custom.html",
		formatted_body: '<a href="https://matrix.to/#/!kLRqKKUQXcibIMtOpl:cadence.moe">#main</a>'
	}])
})

test("message2event: simple message link", async t => {
	const events = await messageToEvent(data.message.simple_message_link, data.guild.general, {})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.text",
		body: "https://matrix.to/#/!kLRqKKUQXcibIMtOpl:cadence.moe/$X16nfVks1wsrhq4E9SSLiqrf2N8KD0erD0scZG7U5xg",
		format: "org.matrix.custom.html",
		formatted_body: '<a href="https://matrix.to/#/!kLRqKKUQXcibIMtOpl:cadence.moe/$X16nfVks1wsrhq4E9SSLiqrf2N8KD0erD0scZG7U5xg">https://matrix.to/#/!kLRqKKUQXcibIMtOpl:cadence.moe/$X16nfVks1wsrhq4E9SSLiqrf2N8KD0erD0scZG7U5xg</a>'
	}])
})

test("message2event: attachment with no content", async t => {
	const events = await messageToEvent(data.message.attachment_no_content, data.guild.general, {})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.image",
		url: "mxc://cadence.moe/qXoZktDqNtEGuOCZEADAMvhM",
		body: "image.png",
		external_url: "https://cdn.discordapp.com/attachments/497161332244742154/1124628646431297546/image.png",
		info: {
			mimetype: "image/png",
			w: 466,
			h: 85,
			size: 12919,
		},
	}])
})

test("message2event: stickers", async t => {
	const events = await messageToEvent(data.message.sticker, data.guild.general, {})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.text",
		body: "can have attachments too"
	}, {
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.image",
		url: "mxc://cadence.moe/ZDCNYnkPszxGKgObUIFmvjus",
		body: "image.png",
		external_url: "https://cdn.discordapp.com/attachments/122155380120748034/1106366167486038016/image.png",
		info: {
			mimetype: "image/png",
			w: 333,
			h: 287,
			size: 127373,
		},
	}, {
		$type: "m.sticker",
		"m.mentions": {},
		body: "pomu puff - damn that tiny lil bitch really chuffing. puffing that fat ass dart",
		info: {
			mimetype: "image/png"
			// thumbnail_url
			// thumbnail_info
		},
		url: "mxc://cadence.moe/UuUaLwXhkxFRwwWCXipDlBHn"
	}])
})

test("message2event: skull webp attachment with content", async t => {
	const events = await messageToEvent(data.message.skull_webp_attachment_with_content, data.guild.general, {})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.text",
		body: "Image"
	}, {
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.image",
		body: "skull.webp",
		info: {
			w: 1200,
			h: 628,
			mimetype: "image/webp",
			size: 74290
		},
		external_url: "https://cdn.discordapp.com/attachments/112760669178241024/1128084747910918195/skull.webp",
		url: "mxc://cadence.moe/sDxWmDErBhYBxtDcJQgBETes"
	}])
})

test("message2event: reply to skull webp attachment with content", async t => {
	const events = await messageToEvent(data.message.reply_to_skull_webp_attachment_with_content, data.guild.general, {})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.relates_to": {
			"m.in_reply_to": {
				event_id: "$oLyUTyZ_7e_SUzGNWZKz880ll9amLZvXGbArJCKai2Q"
			}
		},
		"m.mentions": {},
		msgtype: "m.text",
		body: "> Extremity: Image\n\nReply",
		format: "org.matrix.custom.html",
		formatted_body:
			'<mx-reply><blockquote><a href="https://matrix.to/#/!kLRqKKUQXcibIMtOpl:cadence.moe/$oLyUTyZ_7e_SUzGNWZKz880ll9amLZvXGbArJCKai2Q">In reply to</a> Extremity'
			+ '<br>Image</blockquote></mx-reply>'
			+ 'Reply'
	}, {
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.image",
		body: "RDT_20230704_0936184915846675925224905.jpg",
		info: {
			w: 2048,
			h: 1536,
			mimetype: "image/jpeg",
			size: 85906
		},
		external_url: "https://cdn.discordapp.com/attachments/112760669178241024/1128084851023675515/RDT_20230704_0936184915846675925224905.jpg",
		url: "mxc://cadence.moe/WlAbFSiNRIHPDEwKdyPeGywa"
	}])
})

test("message2event: simple reply to matrix user", async t => {
	const events = await messageToEvent(data.message.simple_reply_to_matrix_user, data.guild.general, {}, {
		api: {
			getEvent: mockGetEvent(t, "!kLRqKKUQXcibIMtOpl:cadence.moe", "$Ij3qo7NxMA4VPexlAiIx2CB9JbsiGhJeyt-2OvkAUe4", {
				type: "m.room.message",
				content: {
					msgtype: "m.text",
					body: "so can you reply to my webhook uwu"
				},
				sender: "@cadence:cadence.moe"
			})
		}
	})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.relates_to": {
			"m.in_reply_to": {
				event_id: "$Ij3qo7NxMA4VPexlAiIx2CB9JbsiGhJeyt-2OvkAUe4"
			}
		},
		"m.mentions": {
			user_ids: [
				"@cadence:cadence.moe"
			]
		},
		msgtype: "m.text",
		body: "> cadence: so can you reply to my webhook uwu\n\nReply",
		format: "org.matrix.custom.html",
		formatted_body:
			'<mx-reply><blockquote><a href="https://matrix.to/#/!kLRqKKUQXcibIMtOpl:cadence.moe/$Ij3qo7NxMA4VPexlAiIx2CB9JbsiGhJeyt-2OvkAUe4">In reply to</a> <a href="https://matrix.to/#/@cadence:cadence.moe">cadence</a>'
			+ '<br>so can you reply to my webhook uwu</blockquote></mx-reply>'
			+ 'Reply'
	}])
})

test("message2event: simple reply to matrix user, reply fallbacks disabled", async t => {
	const events = await messageToEvent(data.message.simple_reply_to_matrix_user, data.guild.general, {includeReplyFallback: false}, {
		api: {
			getEvent: mockGetEvent(t, "!kLRqKKUQXcibIMtOpl:cadence.moe", "$Ij3qo7NxMA4VPexlAiIx2CB9JbsiGhJeyt-2OvkAUe4", {
				type: "m.room.message",
				content: {
					msgtype: "m.text",
					body: "so can you reply to my webhook uwu"
				},
				sender: "@cadence:cadence.moe"
			})
		}
	})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.relates_to": {
			"m.in_reply_to": {
				event_id: "$Ij3qo7NxMA4VPexlAiIx2CB9JbsiGhJeyt-2OvkAUe4"
			}
		},
		"m.mentions": {
			user_ids: [
				"@cadence:cadence.moe"
			]
		},
		msgtype: "m.text",
		body: "Reply"
	}])
})

test("message2event: simple written @mentions for matrix users", async t => {
	let called = 0
	const events = await messageToEvent(data.message.simple_written_at_mention_for_matrix, data.guild.general, {}, {
		api: {
			async getJoinedMembers(roomID) {
				called++
				t.equal(roomID, "!kLRqKKUQXcibIMtOpl:cadence.moe")
				return new Promise(resolve => {
					setTimeout(() => {
						resolve({
							joined: {
								"@cadence:cadence.moe": {
									display_name: "cadence [they]",
									avatar_url: "whatever"
								},
								"@huckleton:cadence.moe": {
									display_name: "huck",
									avatar_url: "whatever"
								},
								"@_ooye_botrac4r:cadence.moe": {
									display_name: "botrac4r",
									avatar_url: "whatever"
								},
								"@_ooye_bot:cadence.moe": {
									display_name: "Out Of Your Element",
									avatar_url: "whatever"
								}
							}
						})
					})
				})
			}
		}
	})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {
			user_ids: [
				"@cadence:cadence.moe",
				"@huckleton:cadence.moe"
			]
		},
		msgtype: "m.text",
		body: "@Cadence, tell me about @Phil, the creator of the Chin Trick, who has become ever more powerful under the mentorship of @botrac4r and @huck"
	}])
	t.equal(called, 1, "should only look up the member list once")
})

test("message2event: very large attachment is linked instead of being uploaded", async t => {
	const events = await messageToEvent({
		content: "hey",
		attachments: [{
			filename: "hey.jpg",
			url: "https://discord.com/404/hey.jpg",
			content_type: "application/i-made-it-up",
			size: 100e6
		}]
	})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.text",
		body: "hey"
	}, {
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.text",
		body: "📄 Uploaded file: https://discord.com/404/hey.jpg (100 MB)",
		format: "org.matrix.custom.html",
		formatted_body: '📄 Uploaded file: <a href="https://discord.com/404/hey.jpg">hey.jpg</a> (100 MB)'
	}])
})

// TODO: read "edits of replies" in the spec
