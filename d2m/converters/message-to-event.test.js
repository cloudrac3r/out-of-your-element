const {test} = require("supertape")
const assert = require("assert")
const {messageToEvent} = require("./message-to-event")
const data = require("../../test/data")

test("message2event: stickers", async t => {
   const events = await messageToEvent(data.message.sticker)
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
      url: "mxc://"
   }])
})
