const {test} = require("supertape")
const {messageToEvent} = require("./message-to-event")
const data = require("../../../test/data")

test("message2event components: pk question mark output", async t => {
	const events = await messageToEvent(data.message_with_components.pk_question_mark_response, data.guild.general, {})
	t.deepEqual(events, [{
		$type: "m.room.message",
		body:
			"| ### Lillith (INX)"
			+ "\n| "
			+ "\n| **Display name:** Lillith (she/her)"
			+ "\n| **Pronouns:** She/Her"
			+ "\n| **Message count:** 3091"
			+ "\n| 🖼️ https://files.inx.moe/p/cdn/lillith.webp"
			+ "\n| "
			+ "\n| ----"
			+ "\n| "
			+ "\n| **Proxy tags:**"
			+ "\n| ``l;text``"
			+ "\n| ``l:text``"
			+ "\n| ``l.text``"
			+ "\n| ``textl.``"
			+ "\n| ``textl;``"
			+ "\n| ``textl:``"
			+ "\n"
			+ "\n-# System ID: `xffgnx` ∙ Member ID: `pphhoh`"
			+ "\n-# Created: 2025-12-31 03:16:45 UTC"
			+ "\n[View on dashboard https://dash.pluralkit.me/profile/m/pphhoh] "
			+ "\n"
			+ "\n----"
			+ "\n"
			+ "\n| **System:** INX (`xffgnx`)"
			+ "\n| **Member:** Lillith (`pphhoh`)"
			+ "\n| **Sent by:** infinidoge1337 (@unknown-user:)"
			+ "\n| "
			+ "\n| **Account Roles (7)**"
			+ "\n| §b, !, ‼, Ears Port Ping, Ears Update Ping, Yttr Ping, unsup Ping"
			+ "\n| 🖼️ https://files.inx.moe/p/cdn/lillith.webp"
			+ "\n| "
			+ "\n| ----"
			+ "\n| "
			+ "\n| Same hat"
			+ "\n| 🖼️ Image: https://bridge.example.org/download/discordcdn/934955898965729280/1466556006527012987/image.png"
			+ "\n"
			+ "\n-# Original Message ID: 1466556003645657118 · <t:1769724599:f>",
		format: "org.matrix.custom.html",
		formatted_body: "<blockquote>"
			+ "<h3>Lillith (INX)</h3>"
			+ "<p><strong>Display name:</strong> Lillith (she/her)"
			+ "<br><strong>Pronouns:</strong> She/Her"
			+ "<br><strong>Message count:</strong> 3091</p>"
			+ `🖼️ <a href="https://files.inx.moe/p/cdn/lillith.webp">https://files.inx.moe/p/cdn/lillith.webp</a>`
			+ "<hr>"
			+ "<p><strong>Proxy tags:</strong>"
			+ "<br><code>l;text</code>"
			+ "<br><code>l:text</code>"
			+ "<br><code>l.text</code>"
			+ "<br><code>textl.</code>"
			+ "<br><code>textl;</code>"
			+ "<br><code>textl:</code></p></blockquote>"
			+ "<p><sub>System ID: <code>xffgnx</code> ∙ Member ID: <code>pphhoh</code></sub><br>"
			+ "<sub>Created: 2025-12-31 03:16:45 UTC</sub></p>"
			+ `<a href="https://dash.pluralkit.me/profile/m/pphhoh">View on dashboard</a> `
			+ "<hr>"
			+ "<blockquote><p><strong>System:</strong> INX (<code>xffgnx</code>)"
			+ "<br><strong>Member:</strong> Lillith (<code>pphhoh</code>)"
			+ "<br><strong>Sent by:</strong> infinidoge1337 (@unknown-user:)"
			+ "<br><br><strong>Account Roles (7)</strong>"
			+ "<br>§b, !, ‼, Ears Port Ping, Ears Update Ping, Yttr Ping, unsup Ping</p>"
			+ `🖼️ <a href="https://files.inx.moe/p/cdn/lillith.webp">https://files.inx.moe/p/cdn/lillith.webp</a>`
			+ "<hr>"
			+ "<p>Same hat</p>"
			+ `🖼️ Image: <a href="https://bridge.example.org/download/discordcdn/934955898965729280/1466556006527012987/image.png">image.png</a></blockquote>`
			+ "<p><sub>Original Message ID: 1466556003645657118 · &lt;t:1769724599:f&gt;</sub></p>",
		"m.mentions": {},
		msgtype: "m.text",
	}])
})
