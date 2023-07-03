const {test} = require("supertape")
const {messageToEvent} = require("./message-to-event")
const data = require("../../test/data")

test("message2event: attachment with no content", async t => {
   const events = await messageToEvent(data.message.attachment_no_content, data.guild.general)
   t.deepEqual(events, [{
      $type: "m.room.message",
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
   const events = await messageToEvent(data.message.sticker, data.guild.general)
   t.deepEqual(events, [{
      $type: "m.room.message",
      msgtype: "m.text",
      body: "can have attachments too"
   }, {
      $type: "m.room.message",
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
      body: "pomu puff - damn that tiny lil bitch really chuffing. puffing that fat ass dart",
      info: {
         mimetype: "image/png"
         // thumbnail_url
         // thumbnail_info
      },
      url: "mxc://cadence.moe/UuUaLwXhkxFRwwWCXipDlBHn"
   }])
})
