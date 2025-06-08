// @ts-check

const assert = require("assert/strict")
const {router, test} = require("../../../test/web")

test("web info: returns 404 when message doesn't exist", async t => {
	const res = await router.test("get", "/api/message?message_id=1")
	assert(res instanceof Response)
	t.equal(res.status, 404)
})

test("web info: returns data for a matrix message and profile", async t => {
	let called = 0
	const raw = {
		type: "m.room.message",
		room_id: "!qzDBLKlildpzrrOnFZ:cadence.moe",
		sender: "@cadence:cadence.moe",
		content: {
			msgtype: "m.text",
			body: "testing :heart_pink: :heart_pink: ",
			format: "org.matrix.custom.html",
			formatted_body: "testing <img data-mx-emoticon=\"\" src=\"mxc://cadence.moe/AyAhnRNjWyFhJYTRibYwQpvf\" alt=\":heart_pink:\" title=\":heart_pink:\" height=\"32\" vertical-align=\"middle\" /> <img data-mx-emoticon=\"\" src=\"mxc://cadence.moe/AyAhnRNjWyFhJYTRibYwQpvf\" alt=\":heart_pink:\" title=\":heart_pink:\" height=\"32\" vertical-align=\"middle\" />"
		},
		origin_server_ts: 1739312945302,
		unsigned: {
			membership: "join",
			age: 10063702303
		},
		event_id: "$51gH61p_eJc2RylOdE2lAr4-ogP7dS0WJI62lCFzBvk",
		user_id: "@cadence:cadence.moe",
		age: 10063702303
	}
	const res = await router.test("get", "/api/message?message_id=1339000288144658482", {
		api: {
			// @ts-ignore - returning static data when method could be called with a different typescript generic
			async getEvent(roomID, eventID) {
				called++
				t.equal(roomID, "!qzDBLKlildpzrrOnFZ:cadence.moe")
				t.equal(eventID, "$51gH61p_eJc2RylOdE2lAr4-ogP7dS0WJI62lCFzBvk")
				return raw
			},
			async getProfile(mxid) {
				called++
				t.equal(mxid, "@cadence:cadence.moe")
				return {
					displayname: "okay 🤍 yay 🤍"
				}
			}
		}
	})
	t.deepEqual(res, {
		source: "matrix",
		matrix_author: {
			displayname: "okay 🤍 yay 🤍",
			avatar_url: null,
			mxid: "@cadence:cadence.moe"
		},
		events: [{
			metadata: {
			  event_id: "$51gH61p_eJc2RylOdE2lAr4-ogP7dS0WJI62lCFzBvk",
			  event_subtype: "m.text",
			  event_type: "m.room.message",
			  part: 0,
			  reaction_part: 0,
			  room_id: "!qzDBLKlildpzrrOnFZ:cadence.moe",
			  sender: "@cadence:cadence.moe",
			  source: 0
			},
			raw
		}]
	})
	t.equal(called, 2)
})

test("web info: returns data for a matrix message without profile", async t => {
	let called = 0
	const raw = {
		type: "m.room.message",
		room_id: "!qzDBLKlildpzrrOnFZ:cadence.moe",
		sender: "@cadence:cadence.moe",
		content: {
			msgtype: "m.text",
			body: "testing :heart_pink: :heart_pink: ",
			format: "org.matrix.custom.html",
			formatted_body: "testing <img data-mx-emoticon=\"\" src=\"mxc://cadence.moe/AyAhnRNjWyFhJYTRibYwQpvf\" alt=\":heart_pink:\" title=\":heart_pink:\" height=\"32\" vertical-align=\"middle\" /> <img data-mx-emoticon=\"\" src=\"mxc://cadence.moe/AyAhnRNjWyFhJYTRibYwQpvf\" alt=\":heart_pink:\" title=\":heart_pink:\" height=\"32\" vertical-align=\"middle\" />"
		},
		origin_server_ts: 1739312945302,
		unsigned: {
			membership: "join",
			age: 10063702303
		},
		event_id: "$51gH61p_eJc2RylOdE2lAr4-ogP7dS0WJI62lCFzBvk",
		user_id: "@cadence:cadence.moe",
		age: 10063702303
	}
	const res = await router.test("get", "/api/message?message_id=1339000288144658482", {
		api: {
			// @ts-ignore - returning static data when method could be called with a different typescript generic
			async getEvent(roomID, eventID) {
				called++
				t.equal(roomID, "!qzDBLKlildpzrrOnFZ:cadence.moe")
				t.equal(eventID, "$51gH61p_eJc2RylOdE2lAr4-ogP7dS0WJI62lCFzBvk")
				return raw
			}
		}
	})
	t.deepEqual(res, {
		source: "matrix",
		matrix_author: {
			displayname: "@cadence:cadence.moe",
			avatar_url: null,
			mxid: "@cadence:cadence.moe"
		},
		events: [{
			metadata: {
			  event_id: "$51gH61p_eJc2RylOdE2lAr4-ogP7dS0WJI62lCFzBvk",
			  event_subtype: "m.text",
			  event_type: "m.room.message",
			  part: 0,
			  reaction_part: 0,
			  room_id: "!qzDBLKlildpzrrOnFZ:cadence.moe",
			  sender: "@cadence:cadence.moe",
			  source: 0
			},
			raw
		}]
	})
	t.equal(called, 1)
})

test("web info: returns data for a discord message", async t => {
	let called = 0
	const raw1 = {
		type: "m.room.message",
		sender: "@_ooye_accavish:cadence.moe",
		content: {
			"m.mentions": {},
			msgtype: "m.text",
			body: "brony music mentioned on wikipedia's did you know and also unrelated cat pic"
		},
		origin_server_ts: 1749377203735,
		unsigned: {
			membership: "join",
			age: 119
		},
		event_id: "$AfrB8hzXkDMvuoWjSZkDdFYomjInWH7jMBPkwQMN8AI",
		room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe"
	}
	const raw2 = {
		type: "m.room.message",
		sender: "@_ooye_accavish:cadence.moe",
		content: {
			"m.mentions": {},
			msgtype: "m.image",
			url: "mxc://cadence.moe/ABOMymxHcpVeecHvmSIYmYXx",
			external_url: "https://bridge.cadence.moe/download/discordcdn/112760669178241024/1381212840710504448/image.png",
			body: "image.png",
			filename: "image.png",
			info: {
				mimetype: "image/png",
				w: 966,
				h: 368,
				size: 166060
			}
		},
		origin_server_ts: 1749377203789,
		unsigned: {
			membership: "join",
			age: 65
		},
		event_id: "$43baKEhJfD-RlsFQi0LB16Zxd8yMqp0HSVL00TDQOqM",
		room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe"
	}
	const res = await router.test("get", "/api/message?message_id=1381212840957972480", {
		api: {
			// @ts-ignore - returning static data when method could be called with a different typescript generic
			async getEvent(roomID, eventID) {
				called++
				t.equal(roomID, "!kLRqKKUQXcibIMtOpl:cadence.moe")
				if (eventID === raw1.event_id) {
					return raw1
				} else {
					assert(eventID === raw2.event_id)
					return raw2
				}
			}
		}
	})
	t.deepEqual(res, {
		source: "discord",
		matrix_author: undefined,
		events: [{
			metadata: {
			  event_id: "$AfrB8hzXkDMvuoWjSZkDdFYomjInWH7jMBPkwQMN8AI",
			  event_subtype: "m.text",
			  event_type: "m.room.message",
			  part: 0,
			  reaction_part: 1,
			  room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
			  sender: "@_ooye_accavish:cadence.moe",
			  source: 1
			},
			raw: raw1
		}, {
			metadata: {
				event_id: "$43baKEhJfD-RlsFQi0LB16Zxd8yMqp0HSVL00TDQOqM",
				event_subtype: "m.image",
				event_type: "m.room.message",
				part: 1,
				reaction_part: 0,
				room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe",
				sender: "@_ooye_accavish:cadence.moe",
				source: 1
			},
			raw: raw2
		}]
	})
	t.equal(called, 2)
})
