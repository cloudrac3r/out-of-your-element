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

test("message2event embeds: nothing but a field", async t => {
	const events = await messageToEvent(data.message_with_embeds.nothing_but_a_field, data.guild.general, {})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.notice",
		body: "**Amanda 🎵#2192 :online:"
			+ "\nwillow tree, branch 0**"
			+ "\n**❯ Uptime:**\n3m 55s\n**❯ Memory:**\n64.45MB",
		format: "org.matrix.custom.html",
		formatted_body: '<strong>Amanda 🎵#2192 <img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/LCEqjStXCxvRQccEkuslXEyZ\" title=\":online:\" alt=\":online:\">'
			+ '<br>willow tree, branch 0</strong>'
			+ '<br><strong>❯ Uptime:</strong><br>3m 55s'
			+ '<br><strong>❯ Memory:</strong><br>64.45MB'
	}])
})

test("message2event embeds: reply with just an embed", async t => {
	const events = await messageToEvent(data.message_with_embeds.reply_with_only_embed, data.guild.general, {})
	t.deepEqual(events, [{
		$type: "m.room.message",
		msgtype: "m.notice",
		"m.mentions": {},
		body: "[**⏺️ dynastic (@dynastic)**](https://twitter.com/i/user/719631291747078145)"
			+ "\n\n**https://twitter.com/i/status/1707484191963648161**"
			+ "\n\ndoes anyone know where to find that one video of the really mysterious yam-like object being held up to a bunch of random objects, like clocks, and they have unexplained impossible reactions to it?"
			+ "\n\n**Retweets**"
			+ "\n119"
			+ "\n\n**Likes**"
			+ "\n5581"
			+ "\n\n— Twitter",
		format: "org.matrix.custom.html",
		formatted_body: '<a href="https://twitter.com/i/user/719631291747078145"><strong>⏺️ dynastic (@dynastic)</strong></a>'
			+ '<br><br><strong><a href="https://twitter.com/i/status/1707484191963648161">https://twitter.com/i/status/1707484191963648161</a></strong>'
			+ '<br><br>does anyone know where to find that one video of the really mysterious yam-like object being held up to a bunch of random objects, like clocks, and they have unexplained impossible reactions to it?'
			+ '<br><br><strong>Retweets</strong><br>119<br><br><strong>Likes</strong><br>5581<br><br>— Twitter'
	}])
})

test("message2event embeds: image embed and attachment", async t => {
	const events = await messageToEvent(data.message_with_embeds.image_embed_and_attachment, data.guild.general, {}, {
		api: {
			async getJoinedMembers(roomID) {
				return {joined: []}
			}
		}
	})
	t.deepEqual(events, [{
		$type: "m.room.message",
		msgtype: "m.text",
		body: "https://tootsuite.net/Warp-Gate2.gif\ntanget: @ monster spawner",
		format: "org.matrix.custom.html",
		formatted_body: '<a href="https://tootsuite.net/Warp-Gate2.gif">https://tootsuite.net/Warp-Gate2.gif</a><br>tanget: @ monster spawner',
		"m.mentions": {}
	}, {
		$type: "m.room.message",
		msgtype: "m.image",
		url: "mxc://cadence.moe/zAXdQriaJuLZohDDmacwWWDR",
		body: "Screenshot_20231001_034036.jpg",
		external_url: "https://cdn.discordapp.com/attachments/176333891320283136/1157854643037163610/Screenshot_20231001_034036.jpg?ex=651a1faa&is=6518ce2a&hm=eb5ca80a3fa7add8765bf404aea2028a28a2341e4a62435986bcdcf058da82f3&",
		filename: "Screenshot_20231001_034036.jpg",
		info: {
			h: 1170,
			w: 1080,
			size: 51981,
			mimetype: "image/jpeg"
		},
		"m.mentions": {}
	}])
})
