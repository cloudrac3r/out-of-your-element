const {test} = require("supertape")
const {threadToAnnouncement} = require("./thread-to-announcement")
const data = require("../../../test/data")
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

const viaApi = {
	async getStateEvent(roomID, type, key) {
		return {
			users: {
				"@_ooye_bot:cadence.moe": 100
			}
		}
	},
	async getJoinedMembers(roomID) {
		return {
			joined: {
				"@_ooye_bot:cadence.moe": {display_name: null, avatar_url: null},
				"@user:matrix.org": {display_name: null, avatar_url: null}
			}
		}
	}
}

test("thread2announcement: no known creator, no branched from event", async t => {
	const content = await threadToAnnouncement("!parent", "!thread", null, {
		name: "test thread",
		id: "-1"
	}, {api: viaApi})
	t.deepEqual(content, {
		msgtype: "m.text",
		body: "Thread started: test thread https://matrix.to/#/!thread?via=cadence.moe&via=matrix.org",
		format: "org.matrix.custom.html",
		formatted_body: `Thread started: <a href="https://matrix.to/#/!thread?via=cadence.moe&via=matrix.org">test thread</a>`,
		"m.mentions": {}
	})
})

test("thread2announcement: known creator, no branched from event", async t => {
	const content = await threadToAnnouncement("!parent", "!thread", "@_ooye_crunch_god:cadence.moe", {
		name: "test thread",
		id: "-1"
	}, {api: viaApi})
	t.deepEqual(content, {
		msgtype: "m.emote",
		body: "started a thread: test thread https://matrix.to/#/!thread?via=cadence.moe&via=matrix.org",
		format: "org.matrix.custom.html",
		formatted_body: `started a thread: <a href="https://matrix.to/#/!thread?via=cadence.moe&via=matrix.org">test thread</a>`,
		"m.mentions": {}
	})
})

test("thread2announcement: no known creator, branched from discord event", async t => {
	const content = await threadToAnnouncement("!kLRqKKUQXcibIMtOpl:cadence.moe", "!thread", null, {
		name: "test thread",
		id: "1126786462646550579"
	}, {
		api: {
			getEvent: mockGetEvent(t, "!kLRqKKUQXcibIMtOpl:cadence.moe", "$X16nfVks1wsrhq4E9SSLiqrf2N8KD0erD0scZG7U5xg", {
				type: 'm.room.message',
				sender: '@_ooye_bot:cadence.moe',
				content: {
					msgtype: 'm.text',
					body: 'testing testing testing'
				}
			}),
			...viaApi
		}
	})
	t.deepEqual(content, {
		msgtype: "m.text",
		body: "Thread started: test thread https://matrix.to/#/!thread?via=cadence.moe&via=matrix.org",
		format: "org.matrix.custom.html",
		formatted_body: `Thread started: <a href="https://matrix.to/#/!thread?via=cadence.moe&via=matrix.org">test thread</a>`,
		"m.mentions": {},
		"m.relates_to": {
			"m.in_reply_to": {
				event_id: "$X16nfVks1wsrhq4E9SSLiqrf2N8KD0erD0scZG7U5xg"
			}
		}
	})
})

test("thread2announcement: known creator, branched from discord event", async t => {
	const content = await threadToAnnouncement("!kLRqKKUQXcibIMtOpl:cadence.moe", "!thread", "@_ooye_crunch_god:cadence.moe", {
		name: "test thread",
		id: "1126786462646550579"
	}, {
		api: {
			getEvent: mockGetEvent(t, "!kLRqKKUQXcibIMtOpl:cadence.moe", "$X16nfVks1wsrhq4E9SSLiqrf2N8KD0erD0scZG7U5xg", {
				type: 'm.room.message',
				sender: '@_ooye_bot:cadence.moe',
				content: {
					msgtype: 'm.text',
					body: 'testing testing testing'
				}
			}),
			...viaApi
		}
	})
	t.deepEqual(content, {
		msgtype: "m.emote",
		body: "started a thread: test thread https://matrix.to/#/!thread?via=cadence.moe&via=matrix.org",
		format: "org.matrix.custom.html",
		formatted_body: `started a thread: <a href="https://matrix.to/#/!thread?via=cadence.moe&via=matrix.org">test thread</a>`,
		"m.mentions": {},
		"m.relates_to": {
			"m.in_reply_to": {
				event_id: "$X16nfVks1wsrhq4E9SSLiqrf2N8KD0erD0scZG7U5xg"
			}
		}
	})
})

test("thread2announcement: no known creator, branched from matrix event", async t => {
	const content = await threadToAnnouncement("!kLRqKKUQXcibIMtOpl:cadence.moe", "!thread", null, {
		name: "test thread",
		id: "1128118177155526666"
	}, {
		api: {
			getEvent: mockGetEvent(t, "!kLRqKKUQXcibIMtOpl:cadence.moe", "$Ij3qo7NxMA4VPexlAiIx2CB9JbsiGhJeyt-2OvkAUe4", {
				type: "m.room.message",
				content: {
					msgtype: "m.text",
					body: "so can you reply to my webhook uwu"
				},
				sender: "@cadence:cadence.moe"
			}),
			...viaApi
		}
	})
	t.deepEqual(content, {
		msgtype: "m.text",
		body: "Thread started: test thread https://matrix.to/#/!thread?via=cadence.moe&via=matrix.org",
		format: "org.matrix.custom.html",
		formatted_body: `Thread started: <a href="https://matrix.to/#/!thread?via=cadence.moe&via=matrix.org">test thread</a>`,
		"m.mentions": {
			user_ids: ["@cadence:cadence.moe"]
		},
		"m.relates_to": {
			"m.in_reply_to": {
				event_id: "$Ij3qo7NxMA4VPexlAiIx2CB9JbsiGhJeyt-2OvkAUe4"
			}
		}
	})
})
