const {test} = require("supertape")
const {messageToEvent} = require("./message-to-event")
const data = require("../../test/data")
const Ty = require("../../types")

test("message2event embeds: nothing but a field", async t => {
	const events = await messageToEvent(data.message_with_embeds.nothing_but_a_field, data.guild.general, {})
	t.deepEqual(events, [{
		$type: "m.room.message",
		"m.mentions": {},
		msgtype: "m.notice",
		body: "| ### Amanda 🎵#2192 :online:"
			+ "\n| willow tree, branch 0"
			+ "\n| **❯ Uptime:**\n| 3m 55s\n| **❯ Memory:**\n| 64.45MB",
		format: "org.matrix.custom.html",
		formatted_body: '<blockquote><p><strong>Amanda 🎵#2192 <img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/LCEqjStXCxvRQccEkuslXEyZ\" title=\":online:\" alt=\":online:\">'
			+ '<br>willow tree, branch 0</strong>'
			+ '<br><strong>❯ Uptime:</strong><br>3m 55s'
			+ '<br><strong>❯ Memory:</strong><br>64.45MB</p></blockquote>'
	}])
})

test("message2event embeds: reply with just an embed", async t => {
	const events = await messageToEvent(data.message_with_embeds.reply_with_only_embed, data.guild.general, {})
	t.deepEqual(events, [{
		$type: "m.room.message",
		msgtype: "m.notice",
		"m.mentions": {},
		body: "| ## ⏺️ dynastic (@dynastic) https://twitter.com/i/user/719631291747078145"
			+ "\n| \n| ## https://twitter.com/i/status/1707484191963648161"
			+ "\n| \n| does anyone know where to find that one video of the really mysterious yam-like object being held up to a bunch of random objects, like clocks, and they have unexplained impossible reactions to it?"
			+ "\n| \n| ### Retweets"
			+ "\n| 119"
			+ "\n| \n| ### Likes"
			+ "\n| 5581"
			+ "\n| — Twitter",
		format: "org.matrix.custom.html",
		formatted_body: '<blockquote><p><strong><a href="https://twitter.com/i/user/719631291747078145">⏺️ dynastic (@dynastic)</a></strong></p>'
			+ '<p><strong><a href="https://twitter.com/i/status/1707484191963648161">https://twitter.com/i/status/1707484191963648161</a></strong>'
			+ '</p><p>does anyone know where to find that one video of the really mysterious yam-like object being held up to a bunch of random objects, like clocks, and they have unexplained impossible reactions to it?'
			+ '</p><p><strong>Retweets</strong><br>119</p><p><strong>Likes</strong><br>5581</p>— Twitter</blockquote>'
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

test("message2event embeds: blockquote in embed", async t => {
	let called = 0
	const events = await messageToEvent(data.message_with_embeds.blockquote_in_embed, data.guild.general, {}, {
		api: {
			async getStateEvent(roomID, type, key) {
				called++
				t.equal(roomID, "!qzDBLKlildpzrrOnFZ:cadence.moe")
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
				t.equal(roomID, "!qzDBLKlildpzrrOnFZ:cadence.moe")
				return {
					joined: {
						"@_ooye_bot:cadence.moe": {display_name: null, avatar_url: null},
						"@user:example.invalid": {display_name: null, avatar_url: null}
					}
				}
			}
		}
	})
	t.deepEqual(events, [{
		$type: "m.room.message",
		msgtype: "m.text",
		body: ":emoji: **4 |** #wonderland",
		format: "org.matrix.custom.html",
		formatted_body: `<img data-mx-emoticon height=\"32\" src=\"mxc://cadence.moe/mwZaCtRGAQQyOItagDeCocEO\" title=\":emoji:\" alt=\":emoji:\"> <strong>4 |</strong> <a href=\"https://matrix.to/#/!qzDBLKlildpzrrOnFZ:cadence.moe?via=cadence.moe&via=example.invalid\">#wonderland</a>`,
		"m.mentions": {}
	}, {
		$type: "m.room.message",
		msgtype: "m.notice",
		body: "| ## ⏺️ minimus https://matrix.to/#/!qzDBLKlildpzrrOnFZ:cadence.moe/$dVCLyj6kxb3DaAWDtjcv2kdSny8JMMHdDhCMz8mDxVo?via=cadence.moe&via=example.invalid\n| \n| reply draft\n| > The following is a message composed via consensus of the Stinker Council.\n| > \n| > For those who are not currently aware of our existence, we represent the organization known as Wonderland. Our previous mission centered around the assortment and study of puzzling objects, entities and other assorted phenomena. This mission was the focus of our organization for more than 28 years.\n| > \n| > Due to circumstances outside of our control, this directive has now changed. Our new mission will be the extermination of the stinker race.\n| > \n| > There will be no further communication.\n| \n| [Go to Message](https://matrix.to/#/!qzDBLKlildpzrrOnFZ:cadence.moe/$dVCLyj6kxb3DaAWDtjcv2kdSny8JMMHdDhCMz8mDxVo?via=cadence.moe&via=example.invalid)",
		format: "org.matrix.custom.html",
		formatted_body: "<blockquote><p><strong><a href=\"https://matrix.to/#/!qzDBLKlildpzrrOnFZ:cadence.moe/$dVCLyj6kxb3DaAWDtjcv2kdSny8JMMHdDhCMz8mDxVo?via=cadence.moe&via=example.invalid\">⏺️ minimus</a></strong></p><p>reply draft<br><blockquote>The following is a message composed via consensus of the Stinker Council.<br><br>For those who are not currently aware of our existence, we represent the organization known as Wonderland. Our previous mission centered around the assortment and study of puzzling objects, entities and other assorted phenomena. This mission was the focus of our organization for more than 28 years.<br><br>Due to circumstances outside of our control, this directive has now changed. Our new mission will be the extermination of the stinker race.<br><br>There will be no further communication.</blockquote></p><p><a href=\"https://matrix.to/#/!qzDBLKlildpzrrOnFZ:cadence.moe/$dVCLyj6kxb3DaAWDtjcv2kdSny8JMMHdDhCMz8mDxVo?via=cadence.moe&via=example.invalid \">Go to Message</a></p></blockquote>",
		"m.mentions": {}
	}])
	t.equal(called, 2)
})

test("message2event embeds: crazy html is all escaped", async t => {
	const events = await messageToEvent(data.message_with_embeds.escaping_crazy_html_tags, data.guild.general)
	t.deepEqual(events, [{
		$type: "m.room.message",
		msgtype: "m.notice",
		body: "| ## ⏺️ <strong>[<span data-mx-color='#123456'>Hey<script>](https://a.co/&amp;) https://a.co/&amp;<script>"
			+ "\n| \n| ## <strong>[<span data-mx-color='#123456'>Hey<script>](https://a.co/&amp;) https://a.co/&amp;<script>"
			+ "\n| \n| <strong>[<span data-mx-color='#123456'>Hey<script>](https://a.co/&amp;)"
			+ "\n| \n| ### <strong>[<span data-mx-color='#123456'>Hey<script>](https://a.co/&amp;)"
			+ "\n| <strong>[<span data-mx-color='#123456'>Hey<script>](https://a.co/&amp;)"
			+ "\n| — <strong>[<span data-mx-color='#123456'>Hey<script>](https://a.co/&amp;)",
		format: "org.matrix.custom.html",
		formatted_body: `<blockquote>`
			+ `<p><strong><a href="https://a.co/&amp;amp;&lt;script&gt;">⏺️ &lt;strong&gt;[&lt;span data-mx-color=&#39;#123456&#39;&gt;Hey&lt;script&gt;](https://a.co/&amp;amp;)</a></strong></p>`
			+ `<p><strong><a href=\"https://a.co/&amp;amp;&lt;script&gt;">&lt;strong&gt;[&lt;span data-mx-color='#123456'&gt;Hey&lt;script&gt;](<a href="https://a.co/&amp;amp">https://a.co/&amp;amp</a>;)</a></strong></p>`
			+ `<p>&lt;strong&gt;<a href="https://a.co/&amp;amp;">&lt;span data-mx-color='#123456'&gt;Hey&lt;script&gt;</a></p>`
			+ `<p><strong>&lt;strong&gt;[&lt;span data-mx-color='#123456'&gt;Hey&lt;script&gt;](<a href=\"https://a.co/&amp;amp\">https://a.co/&amp;amp</a>;)</strong>`
			+ `<br>&lt;strong&gt;<a href="https://a.co/&amp;amp;">&lt;span data-mx-color='#123456'&gt;Hey&lt;script&gt;</a></p>`
			+ `— &lt;strong&gt;[&lt;span data-mx-color=&#39;#123456&#39;&gt;Hey&lt;script&gt;](https://a.co/&amp;amp;)</blockquote>`,
		"m.mentions": {}
	}])
})
