const {test} = require("supertape")
const {messageToEvent} = require("./message-to-event")
const {MatrixServerError} = require("../../matrix/mreq")
const data = require("../../../test/data")
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
	let called = 0
	const events = await messageToEvent(data.message.simple_room_mention, data.guild.general, {}, {
		api: {
			async getStateEvent(roomID, type, key) {
				called++
				t.equal(roomID, "!BnKuBPCvyfOkhcUjEu:cadence.moe")
				t.equal(type, "m.room.power_levels")
				t.equal(key, "")
				return {
					users: {
						"@_ooye_bot:cadence.moe": 100
					}
				}
			},
			async getJoinedMembers(roomID) {
				called++
				t.equal(roomID, "!BnKuBPCvyfOkhcUjEu:cadence.moe")
				return {
					joined: {
						"@_ooye_bot:cadence.moe": {display_name: null, avatar_url: null},
						"@user:matrix.org": {display_name: null, avatar_url: null}
					}
				}
			}
		}
	})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.text",
		body: "#worm-farm",
		format: "org.matrix.custom.html",
		formatted_body: '<a href="https://matrix.to/#/!BnKuBPCvyfOkhcUjEu:cadence.moe?via=cadence.moe&via=matrix.org">#worm-farm</a>'
	}])
	t.equal(called, 2, "should call getStateEvent and getJoinedMembers once each")
})

test("message2event: nicked room mention", async t => {
	let called = 0
	const events = await messageToEvent(data.message.nicked_room_mention, data.guild.general, {}, {
		api: {
			async getStateEvent(roomID, type, key) {
				called++
				t.equal(roomID, "!kLRqKKUQXcibIMtOpl:cadence.moe")
				t.equal(type, "m.room.power_levels")
				t.equal(key, "")
				return {
					users: {
						"@_ooye_bot:cadence.moe": 100
					}
				}
			},
			async getJoinedMembers(roomID) {
				called++
				t.equal(roomID, "!kLRqKKUQXcibIMtOpl:cadence.moe")
				return {
					joined: {
						"@_ooye_bot:cadence.moe": {display_name: null, avatar_url: null},
						"@user:matrix.org": {display_name: null, avatar_url: null}
					}
				}
			}
		}
	})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.text",
		body: "#main",
		format: "org.matrix.custom.html",
		formatted_body: '<a href="https://matrix.to/#/!kLRqKKUQXcibIMtOpl:cadence.moe?via=cadence.moe&via=matrix.org">#main</a>'
	}])
	t.equal(called, 2, "should call getStateEvent and getJoinedMembers once each")
})

test("message2event: unknown room mention", async t => {
	const events = await messageToEvent(data.message.unknown_room_mention, data.guild.general, {})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.text",
		body: "#unknown-channel [channel from an unbridged server]"
	}])
})

test("message2event: unbridged room mention", async t => {
	const events = await messageToEvent(data.message.unbridged_room_mention, data.guild.general, {})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.text",
		body: "#bad-boots-prison [channel not bridged]"
	}])
})

test("message2event: simple role mentions", async t => {
	const events = await messageToEvent(data.message.simple_role_mentions, data.guild.general, {})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.text",
		body: "I'm just @!!DLCS!!: testing a few role pings @Master Wonder Mage: don't mind me",
		format: "org.matrix.custom.html",
		formatted_body: `I'm just <font color="#a901ff">@!!DLCS!!</font> testing a few role pings <span data-mx-color="#ffffff" data-mx-bg-color="#414eef">@Master Wonder Mage</span> don't mind me`
	}])
})

test("message2event: manually constructed unknown roles should use fallback", async t => {
	const events = await messageToEvent(data.message.unknown_role, data.guild.general, {})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.text",
		body: "I'm just @&4 testing a few role pings <@&B> don't mind me",
		format: "org.matrix.custom.html",
		formatted_body: "I'm just @&4 testing a few role pings &lt;@&amp;B&gt; don't mind me"
	}])
})

test("message2event: simple message link", async t => {
	let called = 0
	const events = await messageToEvent(data.message.simple_message_link, data.guild.general, {}, {
		api: {
			async getStateEvent(roomID, type, key) {
				called++
				t.equal(roomID, "!kLRqKKUQXcibIMtOpl:cadence.moe")
				t.equal(type, "m.room.power_levels")
				t.equal(key, "")
				return {
					users: {
						"@_ooye_bot:cadence.moe": 100
					}
				}
			},
			async getJoinedMembers(roomID) {
				called++
				t.equal(roomID, "!kLRqKKUQXcibIMtOpl:cadence.moe")
				return {
					joined: {
						"@_ooye_bot:cadence.moe": {display_name: null, avatar_url: null},
						"@user:super.invalid": {display_name: null, avatar_url: null}
					}
				}
			}
		}
	})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.text",
		body: "https://matrix.to/#/!kLRqKKUQXcibIMtOpl:cadence.moe/$X16nfVks1wsrhq4E9SSLiqrf2N8KD0erD0scZG7U5xg?via=cadence.moe&via=super.invalid",
		format: "org.matrix.custom.html",
		formatted_body: '<a href="https://matrix.to/#/!kLRqKKUQXcibIMtOpl:cadence.moe/$X16nfVks1wsrhq4E9SSLiqrf2N8KD0erD0scZG7U5xg?via=cadence.moe&amp;via=super.invalid">https://matrix.to/#/!kLRqKKUQXcibIMtOpl:cadence.moe/$X16nfVks1wsrhq4E9SSLiqrf2N8KD0erD0scZG7U5xg?via=cadence.moe&amp;via=super.invalid</a>'
	}])
	t.equal(called, 2, "should call getStateEvent and getJoinedMembers once each")
})

test("message2event: message link that OOYE doesn't know about", async t => {
	let called = 0
	const events = await messageToEvent(data.message.message_link_to_before_ooye, data.guild.general, {}, {
		api: {
			async getEventForTimestamp(roomID, ts) {
				called++
				t.equal(roomID, "!kLRqKKUQXcibIMtOpl:cadence.moe")
				return {
					event_id: "$E8IQDGFqYzOU7BwY5Z74Bg-cwaU9OthXSroaWtgYc7U",
					origin_server_ts: 1613287812754
				}
			},
			async getStateEvent(roomID, type, key) { // for ?via calculation
				called++
				t.equal(roomID, "!kLRqKKUQXcibIMtOpl:cadence.moe")
				t.equal(type, "m.room.power_levels")
				t.equal(key, "")
				return {
					users: {
						"@_ooye_bot:cadence.moe": 100
					}
				}
			},
			async getJoinedMembers(roomID) { // for ?via calculation
				called++
				t.equal(roomID, "!kLRqKKUQXcibIMtOpl:cadence.moe")
				return {
					joined: {
						"@_ooye_bot:cadence.moe": {display_name: null, avatar_url: null},
						"@user:matrix.org": {display_name: null, avatar_url: null}
					}
				}
			}
		}
	})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.text",
		body: "Me: I'll scroll up to find a certain message I'll send\n_scrolls up and clicks message links for god knows how long_\n_completely forgets what they were looking for and simply begins scrolling up to find some fun moments_\n_stumbles upon:_ "
			+ "https://matrix.to/#/!kLRqKKUQXcibIMtOpl:cadence.moe/$E8IQDGFqYzOU7BwY5Z74Bg-cwaU9OthXSroaWtgYc7U?via=cadence.moe&via=matrix.org",
		format: "org.matrix.custom.html",
		formatted_body: "Me: I'll scroll up to find a certain message I'll send<br><em>scrolls up and clicks message links for god knows how long</em><br><em>completely forgets what they were looking for and simply begins scrolling up to find some fun moments</em><br><em>stumbles upon:</em> "
			+ '<a href="https://matrix.to/#/!kLRqKKUQXcibIMtOpl:cadence.moe/$E8IQDGFqYzOU7BwY5Z74Bg-cwaU9OthXSroaWtgYc7U?via=cadence.moe&amp;via=matrix.org">https://matrix.to/#/!kLRqKKUQXcibIMtOpl:cadence.moe/$E8IQDGFqYzOU7BwY5Z74Bg-cwaU9OthXSroaWtgYc7U?via=cadence.moe&amp;via=matrix.org</a>'
	}])
	t.equal(called, 3, "getEventForTimestamp, getStateEvent, and getJoinedMembers should be called once each")
})

test("message2event: message timestamp failed to fetch", async t => {
	let called = 0
	const events = await messageToEvent(data.message.message_link_to_before_ooye, data.guild.general, {}, {
		api: {
			async getEventForTimestamp(roomID, ts) {
				called++
				t.equal(roomID, "!kLRqKKUQXcibIMtOpl:cadence.moe")
				throw new MatrixServerError({
					errcode: "M_NOT_FOUND",
					error: "Unable to find event from 1726762095974 in direction Direction.FORWARDS"
				}, {})
			},
			async getStateEvent(roomID, type, key) { // for ?via calculation
				called++
				t.equal(roomID, "!kLRqKKUQXcibIMtOpl:cadence.moe")
				t.equal(type, "m.room.power_levels")
				t.equal(key, "")
				return {
					users: {
						"@_ooye_bot:cadence.moe": 100
					}
				}
			},
			async getJoinedMembers(roomID) { // for ?via calculation
				called++
				t.equal(roomID, "!kLRqKKUQXcibIMtOpl:cadence.moe")
				return {
					joined: {
						"@_ooye_bot:cadence.moe": {display_name: null, avatar_url: null},
						"@user:matrix.org": {display_name: null, avatar_url: null}
					}
				}
			}
		}
	})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.text",
		body: "Me: I'll scroll up to find a certain message I'll send\n_scrolls up and clicks message links for god knows how long_\n_completely forgets what they were looking for and simply begins scrolling up to find some fun moments_\n_stumbles upon:_ "
			+ "[unknown event, timestamp resolution failed, in room: https://matrix.to/#/!kLRqKKUQXcibIMtOpl:cadence.moe?via=cadence.moe&via=matrix.org]",
		format: "org.matrix.custom.html",
		formatted_body: "Me: I'll scroll up to find a certain message I'll send<br><em>scrolls up and clicks message links for god knows how long</em><br><em>completely forgets what they were looking for and simply begins scrolling up to find some fun moments</em><br><em>stumbles upon:</em> "
			+ '[unknown event, timestamp resolution failed, in room: <a href="https://matrix.to/#/!kLRqKKUQXcibIMtOpl:cadence.moe?via=cadence.moe&amp;via=matrix.org">https://matrix.to/#/!kLRqKKUQXcibIMtOpl:cadence.moe?via=cadence.moe&amp;via=matrix.org</a>]'
	}])
	t.equal(called, 3, "getEventForTimestamp, getStateEvent, and getJoinedMembers should be called once each")
})

test("message2event: message link from another server", async t => {
	const events = await messageToEvent(data.message.message_link_from_another_server, data.guild.general)
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.text",
		body: "Neither of these servers are known to OOYE: https://discord.com/channels/111/222/333 [event is from another server] https://canary.discordapp.com/channels/444/555/666 [event is from another server]",
		format: "org.matrix.custom.html",
		formatted_body: 'Neither of these servers are known to OOYE: <a href="https://discord.com/channels/111/222/333">https://discord.com/channels/111/222/333</a> [event is from another server]'
			+ ' <a href="https://canary.discordapp.com/channels/444/555/666">https://canary.discordapp.com/channels/444/555/666</a> [event is from another server]'
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
		external_url: "https://bridge.example.org/download/discordcdn/497161332244742154/1124628646431297546/image.png",
		filename: "image.png",
		info: {
			mimetype: "image/png",
			w: 466,
			h: 85,
			size: 12919,
		},
	}])
})

test("message2event: spoiler attachment", async t => {
	const events = await messageToEvent(data.message.spoiler_attachment, data.guild.general, {})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.text",
		body: "📄 Uploaded SPOILER file: https://bridge.example.org/download/discordcdn/1100319550446252084/1147465564307079258/SPOILER_69-GNDP-CADENCE.nfs.gci (74 KB)",
		format: "org.matrix.custom.html",
		formatted_body: "<blockquote>📄 Uploaded SPOILER file: <a href=\"https://bridge.example.org/download/discordcdn/1100319550446252084/1147465564307079258/SPOILER_69-GNDP-CADENCE.nfs.gci\">https://bridge.example.org/download/discordcdn/1100319550446252084/1147465564307079258/SPOILER_69-GNDP-CADENCE.nfs.gci</a> (74 KB)</blockquote>"
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
		external_url: "https://bridge.example.org/download/discordcdn/122155380120748034/1106366167486038016/image.png",
		filename: "image.png",
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

test("message2event: lottie sticker", async t => {
	const events = await messageToEvent(data.message.lottie_sticker, data.guild.general, {})
	t.deepEqual(events, [{
		$type: "m.sticker",
		"m.mentions": {},
		body: "8",
		info: {
			mimetype: "image/png",
			w: 160,
			h: 160
		},
		url: "mxc://cadence.moe/ZtvvVbwMIdUZeovWVyGVFCeR"
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
		external_url: "https://bridge.example.org/download/discordcdn/112760669178241024/1128084747910918195/skull.webp",
		filename: "skull.webp",
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
		external_url: "https://bridge.example.org/download/discordcdn/112760669178241024/1128084851023675515/RDT_20230704_0936184915846675925224905.jpg",
		filename: "RDT_20230704_0936184915846675925224905.jpg",
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

test("message2event: reply to matrix user with mention", async t => {
	const events = await messageToEvent(data.message.reply_to_matrix_user_mention, data.guild.general, {}, {
		api: {
			getEvent: mockGetEvent(t, "!kLRqKKUQXcibIMtOpl:cadence.moe", "$7P2O_VTQNHvavX5zNJ35DV-dbJB1Ag80tGQP_JzGdhk", {
				type: "m.room.message",
				content: {
					msgtype: "m.text",
					body: "@_ooye_extremity:cadence.moe you owe me $30",
					format: "org.matrix.custom.html",
					formatted_body: "<a href=\"https://matrix.to/#/@_ooye_extremity:cadence.moe\">@_ooye_extremity:cadence.moe</a> you owe me $30"
				},
				sender: "@cadence:cadence.moe"
			})
		}
	})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.relates_to": {
			"m.in_reply_to": {
				event_id: "$7P2O_VTQNHvavX5zNJ35DV-dbJB1Ag80tGQP_JzGdhk"
			}
		},
		"m.mentions": {
			user_ids: [
				"@cadence:cadence.moe"
			]
		},
		msgtype: "m.text",
		body: "> okay 🤍 yay 🤍: @extremity: you owe me $30\n\nkys",
		format: "org.matrix.custom.html",
		formatted_body:
			'<mx-reply><blockquote><a href="https://matrix.to/#/!kLRqKKUQXcibIMtOpl:cadence.moe/$7P2O_VTQNHvavX5zNJ35DV-dbJB1Ag80tGQP_JzGdhk">In reply to</a> <a href="https://matrix.to/#/@cadence:cadence.moe">okay 🤍 yay 🤍</a>'
			+ '<br><a href="https://matrix.to/#/@_ooye_extremity:cadence.moe">@extremity</a> you owe me $30</blockquote></mx-reply>'
			+ 'kys'
	}])
})

test("message2event: reply with a video", async t => {
	const events = await messageToEvent(data.message.reply_with_video, data.guild.general, {
		api: {
			getEvent: mockGetEvent(t, "!kLRqKKUQXcibIMtOpl:cadence.moe", "$7tJoMw1h44n2gxgLUE1T_YinGrLbK0x-TDY1z6M7GBw", {
				type: "m.room.message",
				content: {
					msgtype: "m.text",
					body: 'deadpicord "extremity you woke up at 4 am"'
				},
				sender: "@_ooye_extremity:cadence.moe"
			})
		}
	})
	t.deepEqual(events, [{
		$type: "m.room.message",
		msgtype: "m.video",
		body: "Ins_1960637570.mp4",
		filename: "Ins_1960637570.mp4",
		url: "mxc://cadence.moe/kMqLycqMURhVpwleWkmASpnU",
		external_url: "https://bridge.example.org/download/discordcdn/112760669178241024/1197621094786531358/Ins_1960637570.mp4",
		info: {
			h: 854,
			mimetype: "video/mp4",
			size: 860559,
			w: 480,
		},
		"m.mentions": {},
		"m.relates_to": {
			"m.in_reply_to": {
				event_id: "$7tJoMw1h44n2gxgLUE1T_YinGrLbK0x-TDY1z6M7GBw"
			}
		}
	}])
})

test("message2event: voice message", async t => {
	const events = await messageToEvent(data.message.voice_message)
	t.deepEqual(events, [{
		$type: "m.room.message",
      body: "voice-message.ogg",
      external_url: "https://bridge.example.org/download/discordcdn/1099031887500034088/1112476845502365786/voice-message.ogg",
      filename: "voice-message.ogg",
      info: {
        duration: 3960,
        mimetype: "audio/ogg",
        size: 10584,
		},
      "m.mentions": {},
      msgtype: "m.audio",
      url: "mxc://cadence.moe/MRRPDggXQMYkrUjTpxQbmcxB"
	}])
})

test("message2event: misc file", async t => {
	const events = await messageToEvent(data.message.misc_file)
	t.deepEqual(events, [{
		$type: "m.room.message",
		msgtype: "m.text",
		body: "final final final revised draft",
		"m.mentions": {}
	}, {
		$type: "m.room.message",
      body: "the.yml",
      external_url: "https://bridge.example.org/download/discordcdn/122155380120748034/1174514575220158545/the.yml",
      filename: "the.yml",
		info: {
			mimetype: "text/plain; charset=utf-8",
			size: 2274
		},
      "m.mentions": {},
      msgtype: "m.file",
      url: "mxc://cadence.moe/HnQIYQmmlIKwOQsbFsIGpzPP"
	}])
})

test("message2event: simple reply in thread to a matrix user's reply", async t => {
	const events = await messageToEvent(data.message.simple_reply_to_reply_in_thread, data.guild.general, {}, {
		api: {
			getEvent: mockGetEvent(t, "!FuDZhlOAtqswlyxzeR:cadence.moe", "$nUM-ABBF8KdnvrhXwLlYAE9dgDl_tskOvvcNIBrtsVo", {
				type: "m.room.message",
				sender: "@cadence:cadence.moe",
				content: {
					msgtype: "m.text",
					body: "> <@_ooye_cadence:cadence.moe> So what I'm wondering is about replies.\n\nWhat about them?",
					format: "org.matrix.custom.html",
					formatted_body: "<mx-reply><blockquote><a href=\"https://matrix.to/#/!FuDZhlOAtqswlyxzeR:cadence.moe/$fWQT8uOrzLzAXNVXz88VkGx7Oo724iS5uD8Qn5KUy9w?via=cadence.moe\">In reply to</a> <a href=\"https://matrix.to/#/@_ooye_cadence:cadence.moe\">@_ooye_cadence:cadence.moe</a><br>So what I&#39;m wondering is about replies.</blockquote></mx-reply>What about them?",
					"m.relates_to": {
						"m.in_reply_to": {
							event_id: "$fWQT8uOrzLzAXNVXz88VkGx7Oo724iS5uD8Qn5KUy9w"
						}
					}
				},
				event_id: "$nUM-ABBF8KdnvrhXwLlYAE9dgDl_tskOvvcNIBrtsVo",
				room_id: "!FuDZhlOAtqswlyxzeR:cadence.moe"
			})
		}
	})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.relates_to": {
			"m.in_reply_to": {
				event_id: "$nUM-ABBF8KdnvrhXwLlYAE9dgDl_tskOvvcNIBrtsVo"
			}
		},
		"m.mentions": {
			user_ids: ["@cadence:cadence.moe"]
		},
		msgtype: "m.text",
      body: "> cadence [they]: What about them?\n\nWell, they don't seem to...",
      format: "org.matrix.custom.html",
      formatted_body: "<mx-reply><blockquote><a href=\"https://matrix.to/#/!FuDZhlOAtqswlyxzeR:cadence.moe/$nUM-ABBF8KdnvrhXwLlYAE9dgDl_tskOvvcNIBrtsVo\">In reply to</a> <a href=\"https://matrix.to/#/@cadence:cadence.moe\">cadence [they]</a><br>What about them?</blockquote></mx-reply>Well, they don't seem to...",
	}])
})

test("message2event: infinidoge's reply to ami's matrix smalltext reply to infinidoge", async t => {
	const events = await messageToEvent(data.message.infinidoge_reply_to_ami_matrix_smalltext_reply_to_infinidoge, data.guild.general, {}, {
		api: {
			getEvent: mockGetEvent(t, "!BnKuBPCvyfOkhcUjEu:cadence.moe", "$W1nsDhNIojWrcQOdnOD9RaEvrz2qyZErQoNhPRs1nK4", {
				type: "m.room.message",
				sender: "@ami:the-apothecary.club",
				content: {
					msgtype: "m.text",
					body: `> <@_ooye_infinidoge:cadence.moe> Neat that they thought of that\n\nlet me guess they got a lot of bug reports like "empty chest with no loot?"`,
					format: "org.matrix.custom.html",
					formatted_body: `<mx-reply><blockquote><a href="https://matrix.to/#/!BnKuBPCvyfOkhcUjEu:cadence.moe/$baby?via=cadence.moe">In reply to</a> <a href="https://matrix.to/#/@_ooye_infinidoge:cadence.moe">@_ooye_infinidoge:cadence.moe</a><br>Neat that they thought of that</blockquote></mx-reply>let me guess they got a lot of bug reports like "empty chest with no loot?"`,
					"m.relates_to": {
						"m.in_reply_to": {
							event_id: "$baby"
						}
					}
				},
				event_id: "$W1nsDhNIojWrcQOdnOD9RaEvrz2qyZErQoNhPRs1nK4",
				room_id: "!BnKuBPCvyfOkhcUjEu:cadence.moe"
			})
		}
	})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.relates_to": {
			"m.in_reply_to": {
				event_id: "$W1nsDhNIojWrcQOdnOD9RaEvrz2qyZErQoNhPRs1nK4"
			}
		},
		"m.mentions": {
			user_ids: ["@ami:the-apothecary.club"]
		},
		msgtype: "m.text",
      body: `> Ami (she/her): let me guess they got a lot of bug reports like "empty chest with no loot?"\n\nMost likely`,
      format: "org.matrix.custom.html",
      formatted_body: `<mx-reply><blockquote><a href="https://matrix.to/#/!BnKuBPCvyfOkhcUjEu:cadence.moe/$W1nsDhNIojWrcQOdnOD9RaEvrz2qyZErQoNhPRs1nK4">In reply to</a> <a href="https://matrix.to/#/@ami:the-apothecary.club">Ami (she/her)</a><br>let me guess they got a lot of bug reports like "empty chest with no loot?"</blockquote></mx-reply>Most likely`,
	}])
})

test("message2event: infinidoge's reply to ami's matrix smalltext singleline reply to infinidoge", async t => {
	const events = await messageToEvent(data.message.infinidoge_reply_to_ami_matrix_smalltext_singleline_reply_to_infinidoge, data.guild.general, {}, {
		api: {
			getEvent: mockGetEvent(t, "!BnKuBPCvyfOkhcUjEu:cadence.moe", "$W1nsDhNIojWrcQOdnOD9RaEvrz2qyZErQoNhPRs1nK4", {
				type: "m.room.message",
				sender: "@ami:the-apothecary.club",
				content: {
					msgtype: "m.text",
					body: `> <@_ooye_infinidoge:cadence.moe> Neat that they thought of that\n\nlet me guess they got a lot of bug reports like "empty chest with no loot?"`,
					format: "org.matrix.custom.html",
					formatted_body: `<mx-reply><blockquote><a href="https://matrix.to/#/!BnKuBPCvyfOkhcUjEu:cadence.moe/$baby?via=cadence.moe">In reply to</a> <a href="https://matrix.to/#/@_ooye_infinidoge:cadence.moe">@_ooye_infinidoge:cadence.moe</a><br>Neat that they thought of that</blockquote></mx-reply>let me guess they got a lot of bug reports like "empty chest with no loot?"`,
					"m.relates_to": {
						"m.in_reply_to": {
							event_id: "$baby"
						}
					}
				},
				event_id: "$W1nsDhNIojWrcQOdnOD9RaEvrz2qyZErQoNhPRs1nK4",
				room_id: "!BnKuBPCvyfOkhcUjEu:cadence.moe"
			})
		}
	})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.relates_to": {
			"m.in_reply_to": {
				event_id: "$W1nsDhNIojWrcQOdnOD9RaEvrz2qyZErQoNhPRs1nK4"
			}
		},
		"m.mentions": {
			user_ids: ["@ami:the-apothecary.club"]
		},
		msgtype: "m.text",
      body: `> Ami (she/her): let me guess they got a lot of bug reports like "empty chest with no loot?"\n\nMost likely`,
      format: "org.matrix.custom.html",
      formatted_body: `<mx-reply><blockquote><a href="https://matrix.to/#/!BnKuBPCvyfOkhcUjEu:cadence.moe/$W1nsDhNIojWrcQOdnOD9RaEvrz2qyZErQoNhPRs1nK4">In reply to</a> <a href="https://matrix.to/#/@ami:the-apothecary.club">Ami (she/her)</a><br>let me guess they got a lot of bug reports like "empty chest with no loot?"</blockquote></mx-reply>Most likely`,
	}])
})

test("message2event: reply to a Discord message that wasn't bridged", async t => {
	const events = await messageToEvent(data.message.reply_to_unknown_message, data.guild.general)
	t.deepEqual(events, [{
		$type: "m.room.message",
		msgtype: "m.text",
      body: `> In reply to a 1-day-old unbridged message:`
			+ `\n> Occimyy: BILLY BOB THE GREAT`
			+ `\n\nenigmatic`,
      format: "org.matrix.custom.html",
      formatted_body: `<blockquote>In reply to a 1-day-old unbridged message from Occimyy:<br>BILLY BOB THE GREAT</blockquote>enigmatic`,
		"m.mentions": {}
	}])
})

test("message2event: simple written @mention for matrix user", async t => {
	const events = await messageToEvent(data.message.simple_written_at_mention_for_matrix, data.guild.general, {}, {
		api: {
			async getJoinedMembers(roomID) {
				t.equal(roomID, "!rEOspnYqdOalaIFniV:cadence.moe")
				return new Promise(resolve => {
					setTimeout(() => {
						resolve({
							joined: {
								"@she_who_brings_destruction:matrix.org": {
									avatar_url: "mxc://matrix.org/FKcfnfFZlEhspeMsERfYtCuO",
									display_name: "ash (Old)"
								},
								"@tomskeleton:cadence.moe": {
									avatar_url: "mxc://cadence.moe/OvYYicuOwfAACKaXKJCUPbVz",
									display_name: "tomskeleton"
								},
								"@she_who_brings_destruction:cadence.moe": {
									avatar_url: "mxc://cadence.moe/XDXLMbkieETPrjFupoeiwyyq",
									display_name: "ash"
								},
								"@_ooye_bot:cadence.moe": {
									avatar_url: "mxc://cadence.moe/jlrgFjYQHzfBvORedOmYqXVz",
									display_name: "Out Of Your Element"
								},
								"@cadence:cadence.moe": {
									avatar_url: "mxc://cadence.moe/GJDPWiryxIhyRBNJzRNYzAlh",
									display_name: "cadence [they]"
								},
								"@_ooye_tomskeleton:cadence.moe": {
									avatar_url: "mxc://cadence.moe/SdSrjjsrNVdyPTAKEGQUhKUK",
									display_name: "tomskeleton"
								},
								"@_ooye_queergasm:cadence.moe": {
									avatar_url: "mxc://cadence.moe/KqXYGbUqhPPJKifLmfpoLnmB",
									display_name: "queergasm"
								},
								"@_ooye_.subtext:cadence.moe": {
									avatar_url: "mxc://cadence.moe/heoCvaUmfCdpxdzaChwwkpEp",
									display_name: ".subtext"
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
				"@she_who_brings_destruction:cadence.moe"
			]
		},
		msgtype: "m.text",
		body: "@ash do you need anything from the store btw as I'm heading there after gym"
	}])
})

test("message2event: advanced written @mentions for matrix users", async t => {
	let called = 0
	const events = await messageToEvent(data.message.advanced_written_at_mention_for_matrix, data.guild.general, {}, {
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
			url: "https://cdn.discordapp.com/attachments/123/456/789.mega",
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
		body: "📄 Uploaded file: https://bridge.example.org/download/discordcdn/123/456/789.mega (100 MB)",
		format: "org.matrix.custom.html",
		formatted_body: '📄 Uploaded file: <a href="https://bridge.example.org/download/discordcdn/123/456/789.mega">hey.jpg</a> (100 MB)'
	}])
})

test("message2event: type 4 channel name change", async t => {
	const events = await messageToEvent(data.special_message.thread_name_change, data.guild.general)
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.emote",
		body: "changed the channel name to **worming**",
		format: "org.matrix.custom.html",
		formatted_body: "changed the channel name to <strong>worming</strong>"
	}])
})

test("message2event: thread start message reference", async t => {
	const events = await messageToEvent(data.special_message.thread_start_context, data.guild.general, {}, {
		api: {
			getEvent: mockGetEvent(t, "!BnKuBPCvyfOkhcUjEu:cadence.moe", "$FchUVylsOfmmbj-VwEs5Z9kY49_dt2zd0vWfylzy5Yo", {
				"type": "m.room.message",
				"sender": "@_ooye_kyuugryphon:cadence.moe",
				"content": {
					"m.mentions": {},
					"msgtype": "m.text",
					"body": "layer 4"
				}
			})
		}
	})
	t.deepEqual(events, [{
		$type: "m.room.message",
		$sender: null,
		msgtype: "m.text",
		body: "layer 4",
		"m.mentions": {}
	}])
})

test("message2event: single large bridged emoji", async t => {
	const events = await messageToEvent(data.message.single_emoji, data.guild.general, {})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.text",
		body: ":hippo:",
		format: "org.matrix.custom.html",
		formatted_body: '<img data-mx-emoticon height="32" src="mxc://cadence.moe/qWmbXeRspZRLPcjseyLmeyXC" title=":hippo:" alt=":hippo:">'
	}])
})

test("message2event: mid-message small bridged emoji", async t => {
	const events = await messageToEvent(data.message.surrounded_emoji, data.guild.general, {})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.text",
		body: "h is for :hippo:!",
		format: "org.matrix.custom.html",
		formatted_body: 'h is for <img data-mx-emoticon height="32" src="mxc://cadence.moe/qWmbXeRspZRLPcjseyLmeyXC" title=":hippo:" alt=":hippo:">!'
	}])
})

test("message2event: emoji that hasn't been registered yet", async t => {
	const events = await messageToEvent(data.message.not_been_registered_emoji, data.guild.general, {})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.text",
		body: ":Yeah:",
		format: "org.matrix.custom.html",
		formatted_body: '<img data-mx-emoticon height="32" src="mxc://cadence.moe/pgdGTxAyEltccRgZKxdqzHHP" title=":Yeah:" alt=":Yeah:">'
	}])
})

test("message2event: emoji triple long name", async t => {
	const events = await messageToEvent(data.message.emoji_triple_long_name, data.guild.general, {})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.text",
		body: ":brillillillilliant_move::brillillillilliant_move::brillillillilliant_move:",
		format: "org.matrix.custom.html",
		formatted_body:
			  '<img data-mx-emoticon height="32" src="mxc://cadence.moe/scfRIDOGKWFDEBjVXocWYQHik" title=":brillillillilliant_move:" alt=":brillillillilliant_move:">'
			+ '<img data-mx-emoticon height="32" src="mxc://cadence.moe/scfRIDOGKWFDEBjVXocWYQHik" title=":brillillillilliant_move:" alt=":brillillillilliant_move:">'
			+ '<img data-mx-emoticon height="32" src="mxc://cadence.moe/scfRIDOGKWFDEBjVXocWYQHik" title=":brillillillilliant_move:" alt=":brillillillilliant_move:">'
	}])
})

test("message2event: crossposted announcements say where they are crossposted from", async t => {
	const events = await messageToEvent(data.special_message.crosspost_announcement, data.guild.general, {})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.text",
		body: "[🔀 Chewey Bot Official Server #announcements]\nAll text based commands are now inactive on Chewey Bot\nTo continue using commands you'll need to use them as slash commands",
		format: "org.matrix.custom.html",
		formatted_body: "🔀 <strong>Chewey Bot Official Server #announcements</strong><br>All text based commands are now inactive on Chewey Bot<br>To continue using commands you'll need to use them as slash commands"
	}])
})

test("message2event: @everyone", async t => {
	const events = await messageToEvent(data.message_mention_everyone.at_everyone)
	t.deepEqual(events, [{
		$type: "m.room.message",
		msgtype: "m.text",
		body: "@room",
		"m.mentions": {
			room: true
		}
	}])
})

test("message2event: @here", async t => {
	const events = await messageToEvent(data.message_mention_everyone.at_here)
	t.deepEqual(events, [{
		$type: "m.room.message",
		msgtype: "m.text",
		body: "@room",
		"m.mentions": {
			room: true
		}
	}])
})

test("message2event: @everyone without permission", async t => {
	const events = await messageToEvent(data.message_mention_everyone.at_everyone_without_permission)
	t.deepEqual(events, [{
		$type: "m.room.message",
		msgtype: "m.text",
		body: "@everyone <-- this is testing that it DOESN'T mention. if this mentions everyone then my apologies.",
		format: "org.matrix.custom.html",
		formatted_body: "@everyone &lt;-- this is testing that it DOESN'T mention. if this mentions everyone then my apologies.",
		"m.mentions": {}
	}])
})

test("message2event: @here without permission", async t => {
	const events = await messageToEvent(data.message_mention_everyone.at_here_without_permission)
	t.deepEqual(events, [{
		$type: "m.room.message",
		msgtype: "m.text",
		body: "@here <-- this is testing that it DOESN'T mention. if this mentions people then my apologies.",
		format: "org.matrix.custom.html",
		formatted_body: "@here &lt;-- this is testing that it DOESN'T mention. if this mentions people then my apologies.",
		"m.mentions": {}
	}])
})

test("message2event: @everyone within a link", async t => {
	const events = await messageToEvent(data.message_mention_everyone.at_everyone_within_link)
	t.deepEqual(events, [{
		$type: "m.room.message",
		msgtype: "m.text",
		body: "https://github.com/@everyone",
		format: "org.matrix.custom.html",
		formatted_body: `<a href="https://github.com/@everyone">https://github.com/@everyone</a>`,
		"m.mentions": {}
	}])
})

test("message2event: forwarded image", async t => {
	const events = await messageToEvent(data.message.forwarded_image)
	t.deepEqual(events, [
		{
			$type: "m.room.message",
			body: "[🔀 Forwarded message]",
			format: "org.matrix.custom.html",
			formatted_body: "🔀 <em>Forwarded message</em>",
			"m.mentions": {},
			msgtype: "m.notice",
		},
		{
			$type: "m.room.message",
			body: "100km.gif",
			external_url: "https://bridge.example.org/download/discordcdn/112760669178241024/1296237494987133070/100km.gif",
			filename: "100km.gif",
			info: {
				h: 300,
				mimetype: "image/gif",
				size: 2965649,
				w: 300,
			},
			"m.mentions": {},
			msgtype: "m.image",
			url: "mxc://cadence.moe/qDAotmebTfEIfsAIVCEZptLh",
		},
	])
})

test("message2event: constructed forwarded message", async t => {
	const events = await messageToEvent(data.message.constructed_forwarded_message, {}, {}, {
		api: {
			async getJoinedMembers() {
				return {
					joined: {
						"@_ooye_bot:cadence.moe": {display_name: null, avatar_url: null},
						"@user:matrix.org": {display_name: null, avatar_url: null}
					}
				}
			}
		}
	})
	t.deepEqual(events, [
		{
			$type: "m.room.message",
			body: "[🔀 Forwarded from #wonderland]"
				+ "\n» What's cooking, good looking? :hipposcope:",
			format: "org.matrix.custom.html",
			formatted_body: `🔀 <em>Forwarded from <a href="https://matrix.to/#/!qzDBLKlildpzrrOnFZ:cadence.moe/$tBIT8mO7XTTCgIINyiAIy6M2MSoPAdJenRl_RLyYuaE?via=cadence.moe&amp;via=matrix.org">wonderland</a></em>`
				+ `<br><blockquote>What's cooking, good looking? <img data-mx-emoticon height="32" src="mxc://cadence.moe/WbYqNlACRuicynBfdnPYtmvc" title=":hipposcope:" alt=":hipposcope:"></blockquote>`,
			"m.mentions": {},
			msgtype: "m.notice",
		},
		{
			$type: "m.room.message",
			body: "100km.gif",
			external_url: "https://bridge.example.org/download/discordcdn/112760669178241024/1296237494987133070/100km.gif",
			filename: "100km.gif",
			info: {
				h: 300,
				mimetype: "image/gif",
				size: 2965649,
				w: 300,
			},
			"m.mentions": {},
			msgtype: "m.image",
			url: "mxc://cadence.moe/qDAotmebTfEIfsAIVCEZptLh",
		},
		{
			$type: "m.room.message",
			body: "» | ## This man"
				+ "\n» | "
				+ "\n» | ## This man is 100 km away from your house"
				+ "\n» | "
				+ "\n» | ### Distance away"
				+ "\n» | 99 km"
				+ "\n» | "
				+ "\n» | ### Distance away"
				+ "\n» | 98 km",
			format: "org.matrix.custom.html",
			formatted_body: "<blockquote><blockquote><p><strong>This man</strong></p><p><strong>This man is 100 km away from your house</strong></p><p><strong>Distance away</strong><br>99 km</p><p><strong>Distance away</strong><br>98 km</p></blockquote></blockquote>",
			"m.mentions": {},
			msgtype: "m.notice"
		}
	])
})

test("message2event: constructed forwarded text", async t => {
	const events = await messageToEvent(data.message.constructed_forwarded_text, {}, {}, {
		api: {
			async getJoinedMembers() {
				return {
					joined: {
						"@_ooye_bot:cadence.moe": {display_name: null, avatar_url: null},
						"@user:matrix.org": {display_name: null, avatar_url: null}
					}
				}
			}
		}
	})
	t.deepEqual(events, [
		{
			$type: "m.room.message",
			body: "[🔀 Forwarded from #amanda-spam]"
				+ "\n» What's cooking, good looking?",
			format: "org.matrix.custom.html",
			formatted_body: `🔀 <em>Forwarded from <a href="https://matrix.to/#/!CzvdIdUQXgUjDVKxeU:cadence.moe?via=cadence.moe&amp;via=matrix.org">amanda-spam</a></em>`
				+ `<br><blockquote>What's cooking, good looking?</blockquote>`,
			"m.mentions": {},
			msgtype: "m.notice",
		},
		{
			$type: "m.room.message",
			body: "What's cooking everybody ‼️",
			"m.mentions": {},
			msgtype: "m.text",
		}
	])
})


test("message2event: don't scan forwarded messages for mentions", async t => {
	const events = await messageToEvent(data.message.forwarded_dont_scan_for_mentions, {}, {}, {})
	t.deepEqual(events, [
		{
			$type: "m.room.message",
			body: "[🔀 Forwarded message]"
				+ "\n» If some folks have spare bandwidth then helping out ArchiveTeam with archiving soon to be deleted research and government data might be worthwhile https://social.luca.run/@luca/113950834185678114",
			format: "org.matrix.custom.html",
			formatted_body: `🔀 <em>Forwarded message</em>`
				+ `<br><blockquote>If some folks have spare bandwidth then helping out ArchiveTeam with archiving soon to be deleted research and government data might be worthwhile <a href="https://social.luca.run/@luca/113950834185678114">https://social.luca.run/@luca/113950834185678114</a></blockquote>`,
			"m.mentions": {},
			msgtype: "m.notice"
		}
	])
})

test("message2event: invite no details embed if no event", async t => {
	const events = await messageToEvent({content: "https://discord.gg/placeholder?event=1381190945646710824"}, {}, {}, {
		snow: {
			invite: {
				getInvite: async () => ({...data.invite.irl, guild_scheduled_event: null})
			}
		}
	})
	t.deepEqual(events, [
		{
			$type: "m.room.message",
			body: "https://discord.gg/placeholder?event=1381190945646710824",
			format: "org.matrix.custom.html",
			formatted_body: "<a href=\"https://discord.gg/placeholder?event=1381190945646710824\">https://discord.gg/placeholder?event=1381190945646710824</a>",
			"m.mentions": {},
			msgtype: "m.text",
		}
	])
})

test("message2event: irl invite event renders embed", async t => {
	const events = await messageToEvent({content: "https://discord.gg/placeholder?event=1381190945646710824"}, {}, {}, {
		snow: {
			invite: {
				getInvite: async () => data.invite.irl
			}
		}
	})
	t.deepEqual(events, [
		{
			$type: "m.room.message",
			body: "https://discord.gg/placeholder?event=1381190945646710824",
			format: "org.matrix.custom.html",
			formatted_body: "<a href=\"https://discord.gg/placeholder?event=1381190945646710824\">https://discord.gg/placeholder?event=1381190945646710824</a>",
			"m.mentions": {},
			msgtype: "m.text",
		},
		{
			$type: "m.room.message",
			msgtype: "m.notice",
			body: `| Scheduled Event - 8 June at 10:00 pm NZT – 9 June at 12:00 am NZT`
				+ `\n| ## forest exploration`
				+ `\n| `
				+ `\n| 📍 the dark forest`,
			format: "org.matrix.custom.html",
			formatted_body: `<blockquote><p>Scheduled Event - 8 June at 10:00 pm NZT – 9 June at 12:00 am NZT</p>`
				+ `<strong>forest exploration</strong>`
				+ `<p>📍 the dark forest</p></blockquote>`,
			"m.mentions": {}
		}
	])
})

test("message2event: vc invite event renders embed", async t => {
	const events = await messageToEvent({content: "https://discord.gg/placeholder?event=1381174024801095751"}, {}, {}, {
		snow: {
			invite: {
				getInvite: async () => data.invite.vc
			}
		}
	})
	t.deepEqual(events, [
		{
			$type: "m.room.message",
			body: "https://discord.gg/placeholder?event=1381174024801095751",
			format: "org.matrix.custom.html",
			formatted_body: "<a href=\"https://discord.gg/placeholder?event=1381174024801095751\">https://discord.gg/placeholder?event=1381174024801095751</a>",
			"m.mentions": {},
			msgtype: "m.text",
		},
		{
			$type: "m.room.message",
			msgtype: "m.notice",
			body: `| Scheduled Event - 9 June at 3:00 pm NZT`
				+ `\n| ## Cooking (Netrunners)`
				+ `\n| Short circuited brain interfaces actually just means your brain is medium rare, yum.`
				+ `\n| `
				+ `\n| 🔊 Cooking`,
			format: "org.matrix.custom.html",
			formatted_body: `<blockquote><p>Scheduled Event - 9 June at 3:00 pm NZT</p>`
				+ `<strong>Cooking (Netrunners)</strong><br>Short circuited brain interfaces actually just means your brain is medium rare, yum.`
				+ `<p>🔊 Cooking</p></blockquote>`,
			"m.mentions": {}
		}
	])
})

test("message2event: vc invite event renders embed with room link", async t => {
	const events = await messageToEvent({content: "https://discord.gg/placeholder?event=1381174024801095751"}, {}, {}, {
		api: {
			getJoinedMembers: async () => ({
				joined: {
					"@_ooye_bot:cadence.moe": {display_name: null, avatar_url: null},
				}
			})
		},
		snow: {
			invite: {
				getInvite: async () => data.invite.known_vc
			}
		}
	})
	t.deepEqual(events, [
		{
			$type: "m.room.message",
			body: "https://discord.gg/placeholder?event=1381174024801095751",
			format: "org.matrix.custom.html",
			formatted_body: "<a href=\"https://discord.gg/placeholder?event=1381174024801095751\">https://discord.gg/placeholder?event=1381174024801095751</a>",
			"m.mentions": {},
			msgtype: "m.text",
		},
		{
			$type: "m.room.message",
			msgtype: "m.notice",
			body: `| Scheduled Event - 9 June at 3:00 pm NZT`
				+ `\n| ## Cooking (Netrunners)`
				+ `\n| Short circuited brain interfaces actually just means your brain is medium rare, yum.`
				+ `\n| `
				+ `\n| 🔊 Hey. - https://matrix.to/#/!FuDZhlOAtqswlyxzeR:cadence.moe?via=cadence.moe`,
			format: "org.matrix.custom.html",
			formatted_body: `<blockquote><p>Scheduled Event - 9 June at 3:00 pm NZT</p>`
				+ `<strong>Cooking (Netrunners)</strong><br>Short circuited brain interfaces actually just means your brain is medium rare, yum.`
				+ `<p>🔊 Hey. - <a href="https://matrix.to/#/!FuDZhlOAtqswlyxzeR:cadence.moe?via=cadence.moe">Hey.</a></p></blockquote>`,
			"m.mentions": {}
		}
	])
})

test("message2event: channel links are converted even inside lists (parser post-processer descends into list items)", async t => {
	let called = 0
	const events = await messageToEvent({
		content: "1. Don't be a dick"
		+ "\n2. Follow rule number 1"
		+ "\n3. Follow Discord TOS"
		+ "\n4. Do **not** post NSFW content, shock content, suggestive content"
		+ "\n5. Please keep <#176333891320283136> professional and helpful, no random off-topic joking"
		+ "\nThis list will probably change in the future"
	}, data.guild.general, {}, {
		api: {
			getJoinedMembers(roomID) {
				called++
				t.equal(roomID, "!qzDBLKlildpzrrOnFZ:cadence.moe")
				return {
					joined: {
						"@quadradical:federated.nexus": {
							membership: "join",
							display_name: "quadradical"
						}
					}
				}
			}
		}
	})
	t.deepEqual(events, [
		{
			$type: "m.room.message",
			body: "1. Don't be a dick"
			+ "\n2. Follow rule number 1"
			+ "\n3. Follow Discord TOS"
			+ "\n4. Do **not** post NSFW content, shock content, suggestive content"
			+ "\n5. Please keep #wonderland professional and helpful, no random off-topic joking"
			+ "\nThis list will probably change in the future",
			format: "org.matrix.custom.html",
			formatted_body: "<ol start=\"1\"><li>Don't be a dick</li><li>Follow rule number 1</li><li>Follow Discord TOS</li><li>Do <strong>not</strong> post NSFW content, shock content, suggestive content</li><li>Please keep <a href=\"https://matrix.to/#/!qzDBLKlildpzrrOnFZ:cadence.moe?via=cadence.moe&via=federated.nexus\">#wonderland</a> professional and helpful, no random off-topic joking</li></ol>This list will probably change in the future",
			"m.mentions": {},
			msgtype: "m.text"
		}
	])
	t.equal(called, 1)
})
