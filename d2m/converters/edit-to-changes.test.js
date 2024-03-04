const {test} = require("supertape")
const {editToChanges} = require("./edit-to-changes")
const data = require("../../test/data")
const Ty = require("../../types")

test("edit2changes: edit by webhook", async t => {
	const {senderMxid, eventsToRedact, eventsToReplace, eventsToSend, promotions} = await editToChanges(data.message_update.edit_by_webhook, data.guild.general, {})
	t.deepEqual(eventsToRedact, [])
	t.deepEqual(eventsToSend, [])
	t.deepEqual(eventsToReplace, [{
		oldID: "$zXSlyI78DQqQwwfPUSzZ1b-nXzbUrCDljJgnGDdoI10",
		newContent: {
			$type: "m.room.message",
			msgtype: "m.text",
			body: "* test 2",
			"m.mentions": {},
			"m.new_content": {
				// *** Replaced With: ***
				msgtype: "m.text",
				body: "test 2",
				"m.mentions": {}
			},
			"m.relates_to": {
				rel_type: "m.replace",
				event_id: "$zXSlyI78DQqQwwfPUSzZ1b-nXzbUrCDljJgnGDdoI10"
			}
		}
	}])
	t.equal(senderMxid, null)
	t.deepEqual(promotions, [])
})

test("edit2changes: bot response", async t => {
	const {senderMxid, eventsToRedact, eventsToReplace, eventsToSend, promotions} = await editToChanges(data.message_update.bot_response, data.guild.general, {
		async getJoinedMembers(roomID) {
			t.equal(roomID, "!hYnGGlPHlbujVVfktC:cadence.moe")
			return new Promise(resolve => {
				setTimeout(() => {
					resolve({
						joined: {
							"@cadence:cadence.moe": {
								displayname: "cadence [they]",
								avatar_url: "whatever"
							},
							"@_ooye_botrac4r:cadence.moe": {
								displayname: "botrac4r",
								avatar_url: "whatever"
							}
						}
					})
				})
			})
		}
	})
	t.deepEqual(eventsToRedact, [])
	t.deepEqual(eventsToSend, [])
	t.deepEqual(eventsToReplace, [{
		oldID: "$fdD9OZ55xg3EAsfvLZza5tMhtjUO91Wg3Otuo96TplY",
		newContent: {
			$type: "m.room.message",
			msgtype: "m.text",
			body: "* :ae_botrac4r: @cadence asked ``­``, I respond: Stop drinking paint. (No)\n\nHit :bn_re: to reroll.",
			format: "org.matrix.custom.html",
			formatted_body: '* <img data-mx-emoticon height="32" src="mxc://cadence.moe/skqfuItqxNmBYekzmVKyoLzs" title=":ae_botrac4r:" alt=":ae_botrac4r:"> @cadence asked <code>­</code>, I respond: Stop drinking paint. (No)<br><br>Hit <img data-mx-emoticon height="32" src="mxc://cadence.moe/OIpqpfxTnHKokcsYqDusxkBT" title=":bn_re:" alt=":bn_re:"> to reroll.',
			"m.mentions": {
				// Client-Server API spec 11.37.7: Copy Discord's behaviour by not re-notifying anyone that an *edit occurred*
			},
			// *** Replaced With: ***
			"m.new_content": {
				msgtype: "m.text",
				body: ":ae_botrac4r: @cadence asked ``­``, I respond: Stop drinking paint. (No)\n\nHit :bn_re: to reroll.",
				format: "org.matrix.custom.html",
				formatted_body: '<img data-mx-emoticon height="32" src="mxc://cadence.moe/skqfuItqxNmBYekzmVKyoLzs" title=":ae_botrac4r:" alt=":ae_botrac4r:"> @cadence asked <code>­</code>, I respond: Stop drinking paint. (No)<br><br>Hit <img data-mx-emoticon height="32" src="mxc://cadence.moe/OIpqpfxTnHKokcsYqDusxkBT" title=":bn_re:" alt=":bn_re:"> to reroll.',
				"m.mentions": {
					// Client-Server API spec 11.37.7: This should contain the mentions for the final version of the event
					"user_ids": ["@cadence:cadence.moe"]
				}
			},
			"m.relates_to": {
				rel_type: "m.replace",
				event_id: "$fdD9OZ55xg3EAsfvLZza5tMhtjUO91Wg3Otuo96TplY"
			}
		}
	}])
	t.equal(senderMxid, "@_ooye_bojack_horseman:cadence.moe")
	t.deepEqual(promotions, [])
})

test("edit2changes: remove caption from image", async t => {
	const {eventsToRedact, eventsToReplace, eventsToSend, promotions} = await editToChanges(data.message_update.removed_caption_from_image, data.guild.general, {})
	t.deepEqual(eventsToRedact, ["$mtR8cJqM4fKno1bVsm8F4wUVqSntt2sq6jav1lyavuA"])
	t.deepEqual(eventsToSend, [])
	t.deepEqual(eventsToReplace, [])
	t.deepEqual(promotions, [{column: "part", eventID: "$51f4yqHinwnSbPEQ9dCgoyy4qiIJSX0QYYVUnvwyTCI"}])
})

test("edit2changes: change file type", async t => {
	const {eventsToRedact, eventsToReplace, eventsToSend, promotions} = await editToChanges(data.message_update.changed_file_type, data.guild.general, {})
	t.deepEqual(eventsToRedact, ["$51f4yqHinwnSbPEQ9dCgoyy4qiIJSX0QYYVUnvwyTCJ"])
	t.deepEqual(eventsToSend, [{
		$type: "m.room.message",
		body: "📝 Uploaded file: https://cdn.discordapp.com/attachments/112760669178241024/1141501302497615912/gaze_into_my_dark_mind.txt (20 MB)",
		format: "org.matrix.custom.html",
		formatted_body: "📝 Uploaded file: <a href=\"https://cdn.discordapp.com/attachments/112760669178241024/1141501302497615912/gaze_into_my_dark_mind.txt\">gaze_into_my_dark_mind.txt</a> (20 MB)",
		"m.mentions": {},
		msgtype: "m.text"
	}])
	t.deepEqual(eventsToReplace, [])
	t.deepEqual(promotions, [{column: "part", nextEvent: true}, {column: "reaction_part", nextEvent: true}])
})

test("edit2changes: add caption back to that image", async t => {
	const {eventsToRedact, eventsToReplace, eventsToSend, promotions} = await editToChanges(data.message_update.added_caption_to_image, data.guild.general, {})
	t.deepEqual(eventsToRedact, [])
	t.deepEqual(eventsToSend, [{
		$type: "m.room.message",
		msgtype: "m.text",
		body: "some text",
		"m.mentions": {}
	}])
	t.deepEqual(eventsToReplace, [])
	t.deepEqual(promotions, [])
})

test("edit2changes: stickers and attachments are not changed, only the content can be edited", async t => {
	const {eventsToRedact, eventsToReplace, eventsToSend} = await editToChanges(data.message_update.edited_content_with_sticker_and_attachments, data.guild.general, {})
	t.deepEqual(eventsToRedact, [])
	t.deepEqual(eventsToSend, [])
	t.deepEqual(eventsToReplace, [{
		oldID: "$lnAF9IosAECTnlv9p2e18FG8rHn-JgYKHEHIh5qdFv4",
		newContent: {
			$type: "m.room.message",
			msgtype: "m.text",
			body: "* only the content can be edited",
			"m.mentions": {},
			// *** Replaced With: ***
			"m.new_content": {
				msgtype: "m.text",
				body: "only the content can be edited",
				"m.mentions": {}
			},
			"m.relates_to": {
				rel_type: "m.replace",
				event_id: "$lnAF9IosAECTnlv9p2e18FG8rHn-JgYKHEHIh5qdFv4"
			}
		}
	}])
})

test("edit2changes: edit of reply to skull webp attachment with content", async t => {
	const {eventsToRedact, eventsToReplace, eventsToSend} = await editToChanges(data.message_update.edit_of_reply_to_skull_webp_attachment_with_content, data.guild.general, {})
	t.deepEqual(eventsToRedact, [])
	t.deepEqual(eventsToSend, [])
	t.deepEqual(eventsToReplace, [{
		oldID: "$vgTKOR5ZTYNMKaS7XvgEIDaOWZtVCEyzLLi5Pc5Gz4M",
		newContent: {
			$type: "m.room.message",
			msgtype: "m.text",
			body: "> Extremity: Image\n\n* Edit",
			format: "org.matrix.custom.html",
			formatted_body:
				'<mx-reply><blockquote><a href="https://matrix.to/#/!kLRqKKUQXcibIMtOpl:cadence.moe/$oLyUTyZ_7e_SUzGNWZKz880ll9amLZvXGbArJCKai2Q">In reply to</a> Extremity'
				+ '<br>Image</blockquote></mx-reply>'
				+ '* Edit',
			"m.mentions": {},
			"m.new_content": {
				msgtype: "m.text",
				body: "Edit",
				"m.mentions": {}
			},
			"m.relates_to": {
				rel_type: "m.replace",
				event_id: "$vgTKOR5ZTYNMKaS7XvgEIDaOWZtVCEyzLLi5Pc5Gz4M"
			}
		}
	}])
})

test("edit2changes: edits the text event when multiple rows have part = 0 (should never happen in real life, but make sure the safety net works)", async t => {
	const {eventsToRedact, eventsToReplace, eventsToSend} = await editToChanges(data.message_update.edited_content_with_sticker_and_attachments_but_all_parts_equal_0, data.guild.general, {})
	t.deepEqual(eventsToRedact, [])
	t.deepEqual(eventsToSend, [])
	t.deepEqual(eventsToReplace, [{
		oldID: "$lnAF9IosAECTnlv9p2e18FG8rHn-JgYKHEHIh5qd999",
		newContent: {
			$type: "m.room.message",
			msgtype: "m.text",
			body: "* only the content can be edited",
			"m.mentions": {},
			// *** Replaced With: ***
			"m.new_content": {
				msgtype: "m.text",
				body: "only the content can be edited",
				"m.mentions": {}
			},
			"m.relates_to": {
				rel_type: "m.replace",
				event_id: "$lnAF9IosAECTnlv9p2e18FG8rHn-JgYKHEHIh5qd999"
			}
		}
	}])
})

test("edit2changes: promotes the text event when multiple rows have part = 1 (should never happen in real life, but make sure the safety net works)", async t => {
	const {eventsToRedact, eventsToReplace, eventsToSend, promotions} = await editToChanges(data.message_update.edited_content_with_sticker_and_attachments_but_all_parts_equal_1, data.guild.general, {})
	t.deepEqual(eventsToRedact, [])
	t.deepEqual(eventsToSend, [])
	t.deepEqual(eventsToReplace, [{
		oldID: "$lnAF9IosAECTnlv9p2e18FG8rHn-JgYKHEHIh5qd111",
		newContent: {
			$type: "m.room.message",
			msgtype: "m.text",
			body: "* only the content can be edited",
			"m.mentions": {},
			// *** Replaced With: ***
			"m.new_content": {
				msgtype: "m.text",
				body: "only the content can be edited",
				"m.mentions": {}
			},
			"m.relates_to": {
				rel_type: "m.replace",
				event_id: "$lnAF9IosAECTnlv9p2e18FG8rHn-JgYKHEHIh5qd111"
			}
		}
	}])
	t.deepEqual(promotions, [
		{
			column: "part",
			eventID: "$lnAF9IosAECTnlv9p2e18FG8rHn-JgYKHEHIh5qd111"
		},
		{
			column: "reaction_part",
			eventID: "$f9cjKiacXI9qPF_nUAckzbiKnJEi0LM399kOkhdd111"
		}
	])
})
