const {test} = require("supertape")
const {editToChanges} = require("./edit-to-changes")
const data = require("../../test/data")
const Ty = require("../../types")

test("edit2changes: edit by webhook", async t => {
	const {senderMxid, eventsToRedact, eventsToReplace, eventsToSend} = await editToChanges(data.message_update.edit_by_webhook, data.guild.general, {})
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
})

test("edit2changes: bot response", async t => {
	const {senderMxid, eventsToRedact, eventsToReplace, eventsToSend} = await editToChanges(data.message_update.bot_response, data.guild.general, {
		async getJoinedMembers(roomID) {
			t.equal(roomID, "!uCtjHhfGlYbVnPVlkG:cadence.moe")
			return new Promise(resolve => {
				setTimeout(() => {
					resolve({
						joined: {
							"@cadence:cadence.moe": {
								display_name: "cadence [they]",
								avatar_url: "whatever"
							},
							"@_ooye_botrac4r:cadence.moe": {
								display_name: "botrac4r",
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
			formatted_body: '* <img src="mxc://cadence.moe/551636841284108289" data-mx-emoticon alt=":ae_botrac4r:" title=":ae_botrac4r:" height="24"> @cadence asked <code>­</code>, I respond: Stop drinking paint. (No)<br><br>Hit <img src="mxc://cadence.moe/362741439211503616" data-mx-emoticon alt=":bn_re:" title=":bn_re:" height="24"> to reroll.',
			"m.mentions": {
				// Client-Server API spec 11.37.7: Copy Discord's behaviour by not re-notifying anyone that an *edit occurred*
			},
			// *** Replaced With: ***
			"m.new_content": {
				msgtype: "m.text",
				body: ":ae_botrac4r: @cadence asked ``­``, I respond: Stop drinking paint. (No)\n\nHit :bn_re: to reroll.",
				format: "org.matrix.custom.html",
				formatted_body: '<img src="mxc://cadence.moe/551636841284108289" data-mx-emoticon alt=":ae_botrac4r:" title=":ae_botrac4r:" height="24"> @cadence asked <code>­</code>, I respond: Stop drinking paint. (No)<br><br>Hit <img src="mxc://cadence.moe/362741439211503616" data-mx-emoticon alt=":bn_re:" title=":bn_re:" height="24"> to reroll.',
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
})

test("edit2changes: remove caption from image", async t => {
	const {eventsToRedact, eventsToReplace, eventsToSend} = await editToChanges(data.message_update.removed_caption_from_image, data.guild.general, {})
	t.deepEqual(eventsToRedact, ["$mtR8cJqM4fKno1bVsm8F4wUVqSntt2sq6jav1lyavuA"])
	t.deepEqual(eventsToSend, [])
	t.deepEqual(eventsToReplace, [])
})

test("edit2changes: add caption back to that image", async t => {
	const {eventsToRedact, eventsToReplace, eventsToSend} = await editToChanges(data.message_update.added_caption_to_image, data.guild.general, {})
	t.deepEqual(eventsToRedact, [])
	t.deepEqual(eventsToSend, [{
		$type: "m.room.message",
		msgtype: "m.text",
		body: "some text",
		"m.mentions": {}
	}])
	t.deepEqual(eventsToReplace, [])
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
