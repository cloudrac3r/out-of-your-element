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

test("message2event: unknown room mention", async t => {
	const events = await messageToEvent(data.message.unknown_room_mention, data.guild.general, {})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.text",
		body: "#[channel-from-an-unknown-server]"
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
			}
		}
	})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.text",
		body: "Me: I'll scroll up to find a certain message I'll send\n_scrolls up and clicks message links for god knows how long_\n_completely forgets what they were looking for and simply begins scrolling up to find some fun moments_\n_stumbles upon:_ "
			+ "https://matrix.to/#/!kLRqKKUQXcibIMtOpl:cadence.moe/$E8IQDGFqYzOU7BwY5Z74Bg-cwaU9OthXSroaWtgYc7U",
		format: "org.matrix.custom.html",
		formatted_body: "Me: I'll scroll up to find a certain message I'll send<br><em>scrolls up and clicks message links for god knows how long</em><br><em>completely forgets what they were looking for and simply begins scrolling up to find some fun moments</em><br><em>stumbles upon:</em> "
			+ '<a href="https://matrix.to/#/!kLRqKKUQXcibIMtOpl:cadence.moe/$E8IQDGFqYzOU7BwY5Z74Bg-cwaU9OthXSroaWtgYc7U">https://matrix.to/#/!kLRqKKUQXcibIMtOpl:cadence.moe/$E8IQDGFqYzOU7BwY5Z74Bg-cwaU9OthXSroaWtgYc7U</a>'
	}])
	t.equal(called, 1, "getEventForTimestamp should be called once")
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
		external_url: "https://cdn.discordapp.com/attachments/497161332244742154/1124628646431297546/image.png",
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
		body: "📄 Uploaded SPOILER file: https://cdn.discordapp.com/attachments/1100319550446252084/1147465564307079258/SPOILER_69-GNDP-CADENCE.nfs.gci (74 KB)",
		format: "org.matrix.custom.html",
		formatted_body: "<blockquote>📄 Uploaded SPOILER file: <a href=\"https://cdn.discordapp.com/attachments/1100319550446252084/1147465564307079258/SPOILER_69-GNDP-CADENCE.nfs.gci\">https://cdn.discordapp.com/attachments/1100319550446252084/1147465564307079258/SPOILER_69-GNDP-CADENCE.nfs.gci</a> (74 KB)</blockquote>"
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
		external_url: "https://cdn.discordapp.com/attachments/112760669178241024/1128084747910918195/skull.webp",
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
		external_url: "https://cdn.discordapp.com/attachments/112760669178241024/1128084851023675515/RDT_20230704_0936184915846675925224905.jpg",
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
		external_url: "https://cdn.discordapp.com/attachments/112760669178241024/1197621094786531358/Ins_1960637570.mp4?ex=65bbee8f&is=65a9798f&hm=ae14f7824c3d526c5e11c162e012e1ee405fd5776e1e9302ed80ccd86503cfda&",
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
      body: "> cadence: What about them?\n\nWell, they don't seem to...",
      format: "org.matrix.custom.html",
      formatted_body: "<mx-reply><blockquote><a href=\"https://matrix.to/#/!FuDZhlOAtqswlyxzeR:cadence.moe/$nUM-ABBF8KdnvrhXwLlYAE9dgDl_tskOvvcNIBrtsVo\">In reply to</a> <a href=\"https://matrix.to/#/@cadence:cadence.moe\">cadence</a><br>What about them?</blockquote></mx-reply>Well, they don't seem to...",
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
