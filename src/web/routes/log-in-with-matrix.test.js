// @ts-check

const tryToCatch = require("try-to-catch")
const {router, test} = require("../../../test/web")
const {MatrixServerError} = require("../../matrix/mreq")

// ***** first request *****

test("log in with matrix: shows web page with form on first request", async t => {
	const html = await router.test("get", "/log-in-with-matrix", {
	})
	t.has(html, `hx-post="/api/log-in-with-matrix"`)
})

// ***** second request *****

let token

test("log in with matrix: checks if mxid format looks valid", async t => {
	const [error] = await tryToCatch(() => router.test("post", "/api/log-in-with-matrix", {
		body: {
			mxid: "x@cadence:cadence.moe"
		}
	}))
	t.equal(error.data.issues[0].validation, "regex")
})

test("log in with matrix: checks if mxid domain format looks valid", async t => {
	const [error] = await tryToCatch(() => router.test("post", "/api/log-in-with-matrix", {
		body: {
			mxid: "@cadence:cadence."
		}
	}))
	t.equal(error.data.issues[0].validation, "regex")
})

test("log in with matrix: sends message when there is no m.direct data", async t => {
	const event = {}
	let called = 0
	await router.test("post", "/api/log-in-with-matrix", {
		body: {
			mxid: "@cadence:cadence.moe"
		},
		api: {
			async getAccountData(type) {
				called++
				t.equal(type, "m.direct")
				throw new MatrixServerError({errcode: "M_NOT_FOUND"})
			},
			async createRoom() {
				called++
				return "!created:cadence.moe"
			},
			async setAccountData(type, content) {
				called++
				t.equal(type, "m.direct")
				t.deepEqual(content, {"@cadence:cadence.moe": ["!created:cadence.moe"]})
			},
			async sendEvent(roomID, type, content) {
				called++
				t.equal(roomID, "!created:cadence.moe")
				t.equal(type, "m.room.message")
				token = content.body.match(/log-in-with-matrix\?token=([a-f0-9-]+)/)[1]
				t.ok(token, "log in token not issued")
				return ""
			}
		},
		event
	})
	t.match(event.node.res.getHeader("location"), /Please check your inbox on Matrix/)
	t.equal(called, 4)
})

test("log in with matrix: does not send another message when a log in is in progress", async t => {
	const event = {}
	await router.test("post", "/api/log-in-with-matrix", {
		body: {
			mxid: "@cadence:cadence.moe"
		},
		event
	})
	t.match(event.node.res.getHeader("location"), /We already sent you a link on Matrix/)
})

test("log in with matrix: reuses room from m.direct", async t => {
	const event = {}
	let called = 0
	await router.test("post", "/api/log-in-with-matrix", {
		body: {
			mxid: "@user1:example.org"
		},
		api: {
			async getAccountData(type) {
				called++
				t.equal(type, "m.direct")
				return {"@user1:example.org": ["!existing:cadence.moe"]}
			},
			async getStateEvent(roomID, type, key) {
				called++
				t.equal(roomID, "!existing:cadence.moe")
				t.equal(type, "m.room.member")
				t.equal(key, "@user1:example.org")
				return {membership: "join"}
			},
			async sendEvent(roomID) {
				called++
				t.equal(roomID, "!existing:cadence.moe")
				return ""
			}
		},
		event
	})
	t.match(event.node.res.getHeader("location"), /Please check your inbox on Matrix/)
	t.equal(called, 3)
})

test("log in with matrix: reuses room from m.direct, reinviting if user has left", async t => {
	const event = {}
	let called = 0
	await router.test("post", "/api/log-in-with-matrix", {
		body: {
			mxid: "@user2:example.org"
		},
		api: {
			async getAccountData(type) {
				called++
				t.equal(type, "m.direct")
				return {"@user2:example.org": ["!existing:cadence.moe"]}
			},
			async getStateEvent(roomID, type, key) {
				called++
				t.equal(roomID, "!existing:cadence.moe")
				t.equal(type, "m.room.member")
				t.equal(key, "@user2:example.org")
				throw new MatrixServerError({errcode: "M_NOT_FOUND"})
			},
			async inviteToRoom(roomID, mxid) {
				called++
				t.equal(roomID, "!existing:cadence.moe")
				t.equal(mxid, "@user2:example.org")
			},
			async sendEvent(roomID) {
				called++
				t.equal(roomID, "!existing:cadence.moe")
				return ""
			}
		},
		event
	})
	t.match(event.node.res.getHeader("location"), /Please check your inbox on Matrix/)
	t.equal(called, 4)
})

// ***** third request *****


test("log in with matrix: does not use up token when requested by Synapse URL previewer", async t => {
	const event = {}
	const [error] = await tryToCatch(() => router.test("get", `/log-in-with-matrix?token=${token}`, {
		headers: {
			"user-agent": "Synapse (bot; +https://github.com/matrix-org/synapse)"
		},
		event
	}))
	t.equal(error.data, "Sorry URL previewer, you can't have this URL.")
})

test("log in with matrix: does not use up token when requested by Discord URL previewer", async t => {
	const event = {}
	const [error] = await tryToCatch(() => router.test("get", `/log-in-with-matrix?token=${token}`, {
		headers: {
			"user-agent": "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)"
		},
		event
	}))
	t.equal(error.data, "Sorry URL previewer, you can't have this URL.")
})

test("log in with matrix: successful request when using valid token", async t => {
	const event = {}
	await router.test("get", `/log-in-with-matrix?token=${token}`, {event})
	t.equal(event.node.res.getHeader("location"), "./")
})

test("log in with matrix: won't log in again if token has been used", async t => {
	const event = {}
	await router.test("get", `/log-in-with-matrix?token=${token}`, {event})
	t.equal(event.node.res.getHeader("location"), "https://bridge.example.org/log-in-with-matrix")
})
