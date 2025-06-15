const {test} = require("supertape")
const {messageToEvent} = require("./message-to-event")
const data = require("../../../test/data")
const {db} = require("../../passthrough")

test("message2event embeds: nothing but a field", async t => {
	const events = await messageToEvent(data.message_with_embeds.nothing_but_a_field, data.guild.general, {})
	t.deepEqual(events, [{
		$type: "m.room.message",
		body: "> ↪️ @papiophidian: used `/stats`",
		format: "org.matrix.custom.html",
		formatted_body: "<blockquote>↪️ <a href=\"https://matrix.to/#/@_ooye_papiophidian:cadence.moe\">@papiophidian</a> used <code>/stats</code></blockquote>",
		"m.mentions": {},
		msgtype: "m.text",
	}, {
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
		body: "> In reply to an unbridged message:"
      	+ "\n> PokemonGod: https://twitter.com/dynastic/status/1707484191963648161"
			+ "\n\n| ## ⏺️ dynastic (@dynastic) https://twitter.com/i/user/719631291747078145"
			+ "\n| \n| does anyone know where to find that one video of the really mysterious yam-like object being held up to a bunch of random objects, like clocks, and they have unexplained impossible reactions to it?"
			+ "\n| \n| ### Retweets"
			+ "\n| 119"
			+ "\n| \n| ### Likes"
			+ "\n| 5581"
			+ "\n| — Twitter",
		format: "org.matrix.custom.html",
		formatted_body: '<blockquote>In reply to an unbridged message from PokemonGod:<br><a href=\"https://twitter.com/dynastic/status/1707484191963648161\">https://twitter.com/dynastic/status/1707484191963648161</a></blockquote>'
			+ '<blockquote><p><strong><a href="https://twitter.com/i/user/719631291747078145">⏺️ dynastic (@dynastic)</a></strong>'
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
		external_url: "https://bridge.example.org/download/discordcdn/176333891320283136/1157854643037163610/Screenshot_20231001_034036.jpg",
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
		formatted_body: "<blockquote><p><strong><a href=\"https://matrix.to/#/!qzDBLKlildpzrrOnFZ:cadence.moe/$dVCLyj6kxb3DaAWDtjcv2kdSny8JMMHdDhCMz8mDxVo?via=cadence.moe&amp;via=example.invalid\">⏺️ minimus</a></strong></p><p>reply draft<br><blockquote>The following is a message composed via consensus of the Stinker Council.<br><br>For those who are not currently aware of our existence, we represent the organization known as Wonderland. Our previous mission centered around the assortment and study of puzzling objects, entities and other assorted phenomena. This mission was the focus of our organization for more than 28 years.<br><br>Due to circumstances outside of our control, this directive has now changed. Our new mission will be the extermination of the stinker race.<br><br>There will be no further communication.</blockquote></p><p><a href=\"https://matrix.to/#/!qzDBLKlildpzrrOnFZ:cadence.moe/$dVCLyj6kxb3DaAWDtjcv2kdSny8JMMHdDhCMz8mDxVo?via=cadence.moe&amp;via=example.invalid\">Go to Message</a></p></blockquote>",
		"m.mentions": {}
	}])
	t.equal(called, 2, "should call getStateEvent and getJoinedMembers once each")
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

test("message2event embeds: title without url", async t => {
	const events = await messageToEvent(data.message_with_embeds.title_without_url, data.guild.general)
	t.deepEqual(events, [{
		$type: "m.room.message",
		body: "> ↪️ @papiophidian: used `/stats`",
		format: "org.matrix.custom.html",
		formatted_body: "<blockquote>↪️ <a href=\"https://matrix.to/#/@_ooye_papiophidian:cadence.moe\">@papiophidian</a> used <code>/stats</code></blockquote>",
		"m.mentions": {},
		msgtype: "m.text",
	}, {
		$type: "m.room.message",
		msgtype: "m.notice",
		body: "| ## Hi, I'm Amanda!\n| \n| I condone pirating music!",
		format: "org.matrix.custom.html",
		formatted_body: `<blockquote><p><strong>Hi, I'm Amanda!</strong></p><p>I condone pirating music!</p></blockquote>`,
		"m.mentions": {}
	}])
})

test("message2event embeds: url without title", async t => {
	const events = await messageToEvent(data.message_with_embeds.url_without_title, data.guild.general)
	t.deepEqual(events, [{
		$type: "m.room.message",
		body: "> ↪️ @papiophidian: used `/stats`",
		format: "org.matrix.custom.html",
		formatted_body: "<blockquote>↪️ <a href=\"https://matrix.to/#/@_ooye_papiophidian:cadence.moe\">@papiophidian</a> used <code>/stats</code></blockquote>",
		"m.mentions": {},
		msgtype: "m.text",
	}, {
		$type: "m.room.message",
		msgtype: "m.notice",
		body: "| I condone pirating music!",
		format: "org.matrix.custom.html",
		formatted_body: `<blockquote><p>I condone pirating music!</p></blockquote>`,
		"m.mentions": {}
	}])
})

test("message2event embeds: author without url", async t => {
	const events = await messageToEvent(data.message_with_embeds.author_without_url, data.guild.general)
	t.deepEqual(events, [{
		$type: "m.room.message",
		body: "> ↪️ @papiophidian: used `/stats`",
		format: "org.matrix.custom.html",
		formatted_body: "<blockquote>↪️ <a href=\"https://matrix.to/#/@_ooye_papiophidian:cadence.moe\">@papiophidian</a> used <code>/stats</code></blockquote>",
		"m.mentions": {},
		msgtype: "m.text",
	}, {
		$type: "m.room.message",
		msgtype: "m.notice",
		body: "| ## Amanda\n| \n| I condone pirating music!",
		format: "org.matrix.custom.html",
		formatted_body: `<blockquote><p><strong>Amanda</strong></p><p>I condone pirating music!</p></blockquote>`,
		"m.mentions": {}
	}])
})

test("message2event embeds: author url without name", async t => {
	const events = await messageToEvent(data.message_with_embeds.author_url_without_name, data.guild.general)
	t.deepEqual(events, [{
		$type: "m.room.message",
		body: "> ↪️ @papiophidian: used `/stats`",
		format: "org.matrix.custom.html",
		formatted_body: "<blockquote>↪️ <a href=\"https://matrix.to/#/@_ooye_papiophidian:cadence.moe\">@papiophidian</a> used <code>/stats</code></blockquote>",
		"m.mentions": {},
		msgtype: "m.text",
	}, {
		$type: "m.room.message",
		msgtype: "m.notice",
		body: "| I condone pirating music!",
		format: "org.matrix.custom.html",
		formatted_body: `<blockquote><p>I condone pirating music!</p></blockquote>`,
		"m.mentions": {}
	}])
})

test("message2event embeds: vx image", async t => {
	const events = await messageToEvent(data.message_with_embeds.vx_image, data.guild.general)
	t.deepEqual(events, [{
		$type: "m.room.message",
		msgtype: "m.text",
		body: "https://vxtwitter.com/TomorrowCorp/status/1760330671074287875 we got a release date!!!",
		format: "org.matrix.custom.html",
		formatted_body: '<a href="https://vxtwitter.com/TomorrowCorp/status/1760330671074287875">https://vxtwitter.com/TomorrowCorp/status/1760330671074287875</a> we got a release date!!!',
		"m.mentions": {}
	}, {
		$type: "m.room.message",
		msgtype: "m.notice",
		body: "| via vxTwitter / fixvx https://github.com/dylanpdx/BetterTwitFix"
			+ "\n| "
			+ "\n| ## Twitter https://twitter.com/tomorrowcorp/status/1760330671074287875"
			+ "\n| "
			+ "\n| ## Tomorrow Corporation (@TomorrowCorp) https://vxtwitter.com/TomorrowCorp/status/1760330671074287875"
			+ "\n| "
			+ "\n| Mark your calendar with a wet black stain! World of Goo 2 releases on May 23, 2024 on Nintendo Switch, Epic Games Store (Win/Mac), and http://WorldOfGoo2.com (Win/Mac/Linux)."
			+ "\n| "
			+ "\n| https://tomorrowcorporation.com/posts/world-of-goo-2-now-with-100-more-release-dates-and-platforms"
			+ "\n| "
			+ "\n| 💖 123 🔁 36"
			+ "\n| "
			+ "\n| 📸 https://pbs.twimg.com/media/GG3zUMGbIAAxs3h.jpg",
		format: "org.matrix.custom.html",
		formatted_body: `<blockquote><p><sub><a href="https://github.com/dylanpdx/BetterTwitFix">vxTwitter / fixvx</a></sub>`
			+ `</p><p><strong><a href="https://twitter.com/tomorrowcorp/status/1760330671074287875">Twitter</a></strong>`
			+ `</p><p><strong><a href="https://vxtwitter.com/TomorrowCorp/status/1760330671074287875">Tomorrow Corporation (@TomorrowCorp)</a></strong>`
			+ `</p><p>Mark your calendar with a wet black stain! World of Goo 2 releases on May 23, 2024 on Nintendo Switch, Epic Games Store (Win/Mac), and <a href="http://WorldOfGoo2.com">http://WorldOfGoo2.com</a> (Win/Mac/Linux).`
			+ `<br><br><a href="https://tomorrowcorporation.com/posts/world-of-goo-2-now-with-100-more-release-dates-and-platforms">https://tomorrowcorporation.com/posts/world-of-goo-2-now-with-100-more-release-dates-and-platforms</a>`
			+ `<br><br>💖 123 🔁 36`
			+ `</p><p>📸 https://pbs.twimg.com/media/GG3zUMGbIAAxs3h.jpg</p></blockquote>`,
		"m.mentions": {}
	}])
})

test("message2event embeds: vx video", async t => {
	const events = await messageToEvent(data.message_with_embeds.vx_video, data.guild.general)
	t.deepEqual(events, [{
		$type: "m.room.message",
		msgtype: "m.text",
		body: "https://vxtwitter.com/McDonalds/status/1759971752254341417",
		format: "org.matrix.custom.html",
		formatted_body: '<a href="https://vxtwitter.com/McDonalds/status/1759971752254341417">https://vxtwitter.com/McDonalds/status/1759971752254341417</a>',
		"m.mentions": {}
	}, {
		$type: "m.room.message",
		msgtype: "m.notice",
		body: "| via vxTwitter / fixvx https://github.com/dylanpdx/BetterTwitFix"
			+ "\n| \n| ## McDonald’s🤝@studiopierrot"
			+ "\n| \n| 💖 89 🔁 21 https://twitter.com/McDonalds/status/1759971752254341417"
			+ "\n| \n| ## McDonald's (@McDonalds) https://vxtwitter.com/McDonalds/status/1759971752254341417"
			+ "\n| \n| 🎞️ https://video.twimg.com/ext_tw_video/1759967449548541952/pu/vid/avc1/1280x720/XN1LFIJqAFBdtaoh.mp4?tag=12",
		format: "org.matrix.custom.html",
		formatted_body: `<blockquote><p><sub><a href="https://github.com/dylanpdx/BetterTwitFix">vxTwitter / fixvx</a></sub>`
			+ `</p><p><strong><a href="https://twitter.com/McDonalds/status/1759971752254341417">McDonald’s🤝@studiopierrot\n\n💖 89 🔁 21</a></strong>`
			+ `</p><p><strong><a href="https://vxtwitter.com/McDonalds/status/1759971752254341417">McDonald's (@McDonalds)</a></strong>`
			+ `</p><p>🎞️ https://video.twimg.com/ext_tw_video/1759967449548541952/pu/vid/avc1/1280x720/XN1LFIJqAFBdtaoh.mp4?tag=12</p></blockquote>`,
		"m.mentions": {}
	}])
})

test("message2event embeds: youtube video", async t => {
	const events = await messageToEvent(data.message_with_embeds.youtube_video, data.guild.general)
	t.deepEqual(events, [{
		$type: "m.room.message",
		msgtype: "m.text",
		body: "https://youtu.be/kDMHHw8JqLE?si=NaqNjVTtXugHeG_E\n\n\nJutomi I'm gonna make these sounds in your walls tonight",
		format: "org.matrix.custom.html",
		formatted_body: `<a href="https://youtu.be/kDMHHw8JqLE?si=NaqNjVTtXugHeG_E">https://youtu.be/kDMHHw8JqLE?si=NaqNjVTtXugHeG_E</a><br><br><br>Jutomi I'm gonna make these sounds in your walls tonight`,
		"m.mentions": {}
	}, {
		$type: "m.room.message",
		msgtype: "m.notice",
		body: "| via YouTube https://www.youtube.com"
			+ "\n| \n| ## Happy O Funny https://www.youtube.com/channel/UCEpQ9aEb1NafpvWp5Aoizrg"
      	+ "\n| \n| ## Shoebill stork clattering sounds like machine guun~!! (Japan Matsue... https://www.youtube.com/watch?v=kDMHHw8JqLE"
			+ "\n| \n| twitter"
			+ "\n| https://twitter.com/matsuevogelpark"
			+ "\n| \n| The shoebill (Balaeniceps rex) also known as whalehead, whale-headed stork, or shoe-billed stork, is a very large stork-like bird. It derives its name from its enormous shoe-shaped bill"
			+ "\n| some people also called them the living dinosaur~~"
			+ "\n| \n| #shoebill #livingdinosaur #happyofunny #weirdcreature #weirdsoun..."
			+ "\n| \n| 🎞️ https://www.youtube.com/embed/kDMHHw8JqLE",
		format: "org.matrix.custom.html",
		formatted_body: `<blockquote><p><sub><a href="https://www.youtube.com">YouTube</a></sub></p>`
			+ `<p><strong><a href="https://www.youtube.com/channel/UCEpQ9aEb1NafpvWp5Aoizrg">Happy O Funny</a></strong>`
			+ `</p><p><strong><a href="https://www.youtube.com/watch?v=kDMHHw8JqLE">Shoebill stork clattering sounds like machine guun~!! (Japan Matsue...</a></strong>`
			+ `</p><p>twitter<br><a href="https://twitter.com/matsuevogelpark">https://twitter.com/matsuevogelpark</a><br><br>The shoebill (Balaeniceps rex) also known as whalehead, whale-headed stork, or shoe-billed stork, is a very large stork-like bird. It derives its name from its enormous shoe-shaped bill<br>some people also called them the living dinosaur~~<br><br>#shoebill #livingdinosaur #happyofunny #weirdcreature #weirdsoun...`
			+ `</p><p>🎞️ https://www.youtube.com/embed/kDMHHw8JqLE`
			+ `</p></blockquote>`,
		"m.mentions": {}
	}])
})

test("message2event embeds: tenor gif should show a video link without a provider", async t => {
	const events = await messageToEvent(data.message_with_embeds.tenor_gif, data.guild.general, {}, {})
	t.deepEqual(events, [{
		$type: "m.room.message",
		msgtype: "m.text",
		body: "@Realdditors: get real https://tenor.com/view/get-real-gif-26176788",
		format: "org.matrix.custom.html",
		formatted_body: "<font color=\"#ff4500\">@Realdditors</font> get real <a href=\"https://tenor.com/view/get-real-gif-26176788\">https://tenor.com/view/get-real-gif-26176788</a>",
		"m.mentions": {}
	}, {
		$type: "m.room.message",
		msgtype: "m.notice",
		body: "| 🎞️ https://media.tenor.com/Bz5pfRIu81oAAAPo/get-real.mp4",
		format: "org.matrix.custom.html",
		formatted_body: "<blockquote><p>🎞️ https://media.tenor.com/Bz5pfRIu81oAAAPo/get-real.mp4</p></blockquote>",
		"m.mentions": {}
	}])
})

test("message2event embeds: if discord creates an embed preview for a discord channel link, don't copy that embed", async t => {
	const events = await messageToEvent(data.message_with_embeds.discord_server_included_punctuation_bad_discord, data.guild.general, {}, {
		api: {
			async getStateEvent(roomID, type, key) {
				t.equal(roomID, "!TqlyQmifxGUggEmdBN:cadence.moe")
				t.equal(type, "m.room.power_levels")
				t.equal(key, "")
				return {
					users: {
						"@_ooye_bot:cadence.moe": 100
					}
				}
			},
			async getJoinedMembers(roomID) {
				t.equal(roomID, "!TqlyQmifxGUggEmdBN:cadence.moe")
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
		msgtype: "m.text",
		body: "(test https://matrix.to/#/!TqlyQmifxGUggEmdBN:cadence.moe/$NB6nPgO2tfXyIwwDSF0Ga0BUrsgX1S-0Xl-jAvI8ucU?via=cadence.moe&via=matrix.org)",
		format: "org.matrix.custom.html",
		formatted_body: `(test <a href="https://matrix.to/#/!TqlyQmifxGUggEmdBN:cadence.moe/$NB6nPgO2tfXyIwwDSF0Ga0BUrsgX1S-0Xl-jAvI8ucU?via=cadence.moe&amp;via=matrix.org">https://matrix.to/#/!TqlyQmifxGUggEmdBN:cadence.moe/$NB6nPgO2tfXyIwwDSF0Ga0BUrsgX1S-0Xl-jAvI8ucU?via=cadence.moe&amp;via=matrix.org</a>)`,
		"m.mentions": {}
	}])
})

test("message2event embeds: nothing generated if embeds are disabled in settings", async t => {
	db.prepare("UPDATE guild_space SET url_preview = 0 WHERE guild_id = ?").run(data.guild.general.id)
	const events = await messageToEvent(data.message_with_embeds.youtube_video, data.guild.general)
	t.deepEqual(events, [{
		$type: "m.room.message",
		msgtype: "m.text",
		body: "https://youtu.be/kDMHHw8JqLE?si=NaqNjVTtXugHeG_E\n\n\nJutomi I'm gonna make these sounds in your walls tonight",
		format: "org.matrix.custom.html",
		formatted_body: `<a href="https://youtu.be/kDMHHw8JqLE?si=NaqNjVTtXugHeG_E">https://youtu.be/kDMHHw8JqLE?si=NaqNjVTtXugHeG_E</a><br><br><br>Jutomi I'm gonna make these sounds in your walls tonight`,
		"m.mentions": {}
	}])
})
