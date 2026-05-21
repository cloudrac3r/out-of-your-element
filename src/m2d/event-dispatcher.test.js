// @ts-check

const {test} = require("supertape")
const {stringifyErrorStack, cleanErrorStack} = require("./event-dispatcher")

test("stringify error stack: works", t => {
	function a() {
		const e = new Error("message", {cause: new Error("inner")})
		// @ts-ignore
		e.prop = 2.1
		throw e
	}
	try {
		a()
		t.fail("shouldn't get here")
	} catch (e) {
		const str = stringifyErrorStack(e)
		t.match(str, /^Error: message$/m)
		t.match(str, /^    at a \(.*event-dispatcher\.test\.js/m)
		t.match(str, /^  \[cause\]: Error: inner$/m)
		t.match(str, /^  \[prop\]: 2.1$/m)
	}
})

test("clean error stack: removes webhook token", t => {
	t.notMatch(
		cleanErrorStack(`
	DiscordAPIError: Service resource is being rate limited.
		at fn (/var/home/cadence/out-of-your-element/node_modules/snowtransfer/src/RequestHandler.ts:591:13)
		at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
		at exports.RequestHandler.request (/var/home/cadence/out-of-your-element/node_modules/snowtransfer/src/RequestHandler.ts:546:17)
		at WebhookMethods.executeWebhook (/var/home/cadence/out-of-your-element/node_modules/snowtransfer/src/methods/Webhook.ts:249:35)
		at /var/home/cadence/out-of-your-element/src/m2d/actions/channel-webhook.js:65:31
		at withWebhook (/var/home/cadence/out-of-your-element/src/m2d/actions/channel-webhook.js:47:9)
		at process.processTicksAndRejections (node:internal/process/task_queues:105:5)
		at async Object.sendMessageWithWebhook (/var/home/cadence/out-of-your-element/src/m2d/actions/channel-webhook.js:64:17)
		at async Object.sendEvent (/var/home/cadence/out-of-your-element/src/m2d/actions/send-event.js:132:27)
		at async /var/home/cadence/out-of-your-element/src/m2d/event-dispatcher.js:208:27
		at async AppService.<anonymous> (/var/home/cadence/out-of-your-element/src/m2d/event-dispatcher.js:162:11) {
	[method]: "POST"
	[path]: "/webhooks/1160903754728611841/pfRqHl9vVZImdqwWWSZxxH8T-JJMnauxroMnHsvC6ARA-3B9_STH_bnHB9pd7QQaUVCG"
	[code]: 40062
	[httpStatus]: 429
	[request]: {"endpoint":"/webhooks/1160903754728611841/pfRqHl9vVZImdqwWWSZxxH8T-JJMnauxroMnHsvC6ARA-3B9_STH_bnHB9pd7QQaUVCG","method":"POST","dataType":"json","data":{"content":"https://discordstatus.com/#day\nOnly what discord tell us right now","allowed_mentions":{"parse":["roles"],"users":[]},"username":"lewri","avatar_url":"https://bridge.cadence.moe/download/matrix/matrix.org/URWwrtSUONGOYhfMsdUzcrir"}}
	[response]: {}
	[name]: "DiscordAPIError"`
		),
		/pfRqHl9v/
	)
})
