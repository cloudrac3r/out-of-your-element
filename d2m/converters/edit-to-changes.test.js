// @ts-check

const {test} = require("supertape")
const {editToChanges} = require("./edit-to-changes")
const data = require("../../test/data")
const Ty = require("../../types")

test("edit2changes: bot response", async t => {
   const {eventsToRedact, eventsToReplace, eventsToSend} = await editToChanges(data.message_update.bot_response, data.guild.general)
   t.deepEqual(eventsToRedact, [])
   t.deepEqual(eventsToSend, [])
   t.deepEqual(eventsToReplace, [{
      oldID: "$fdD9OZ55xg3EAsfvLZza5tMhtjUO91Wg3Otuo96TplY",
      new: {
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
})

test("edit2changes: edit of reply to skull webp attachment with content", async t => {
   const {eventsToRedact, eventsToReplace, eventsToSend} = await editToChanges(data.message_update.edit_of_reply_to_skull_webp_attachment_with_content, data.guild.general)
	t.deepEqual(eventsToRedact, [])
   t.deepEqual(eventsToSend, [])
   t.deepEqual(eventsToReplace, [{
      oldID: "$vgTKOR5ZTYNMKaS7XvgEIDaOWZtVCEyzLLi5Pc5Gz4M",
      new: {
         $type: "m.room.message",
         // TODO: read "edits of replies" in the spec!!!
         msgtype: "m.text",
         body: "* Edit",
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
         // TODO: read "edits of replies" in the spec!!!
      }
   }])
})
