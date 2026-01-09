const {test} = require("supertape")
const {select} = require("../passthrough")
const {onTombstone, onBotMembership} = require("./room-upgrade")

test("join upgraded room: only cares about upgrades in progress", async t => {
	let called = 0
	await onBotMembership({
		type: "m.room.member",
		state_key: "@_ooye_bot:cadence.moe",
		room_id: "!JBxeGYnzQwLnaooOLD:cadence.moe",
		content: {
			membership: "invite"
		}
	}, {
		/* c8 ignore next 4 */
		async joinRoom(roomID) {
			called++
			throw new Error("should not join this room")
		}
	})
	t.equal(called, 0)
})

test("tombstone: only cares about bridged rooms", async t => {
	let called = 0
	await onTombstone({
		event_id: "$tombstone",
		type: "m.room.tombstone",
		state_key: "",
		sender: "@cadence:cadence.moe",
		origin_server_ts: 0,
		room_id: "!imaginary:cadence.moe",
		content: {
			body: "This room has been replaced",
			replacement_room: "!JBxeGYnzQwLnaooNEW:cadence.moe"
		}
	}, {
		/* c8 ignore next 4 */
		async joinRoom(roomID) {
			called++
			throw new Error("should not join this room")
		}
	})
	t.equal(called, 0)
})

test("tombstone: joins new room and stores upgrade in database", async t => {
	let called = 0
	await onTombstone({
		event_id: "$tombstone",
		type: "m.room.tombstone",
		state_key: "",
		sender: "@cadence:cadence.moe",
		origin_server_ts: 0,
		room_id: "!JBxeGYnzQwLnaooOLD:cadence.moe",
		content: {
			body: "This room has been replaced",
			replacement_room: "!JBxeGYnzQwLnaooNEW:cadence.moe"
		}
	}, {
		async joinRoom(roomID) {
			called++
			t.equal(roomID, "!JBxeGYnzQwLnaooNEW:cadence.moe")
			return roomID
		}
	})
	t.equal(called, 1)
	t.ok(select("room_upgrade_pending", ["old_room_id", "new_room_id"], {new_room_id: "!JBxeGYnzQwLnaooNEW:cadence.moe", old_room_id: "!JBxeGYnzQwLnaooOLD:cadence.moe"}).get())
})

test("tombstone: requests invite from upgrader if can't join room", async t => {
	let called = 0
	await onTombstone({
		event_id: "$tombstone",
		type: "m.room.tombstone",
		state_key: "",
		sender: "@cadence:cadence.moe",
		origin_server_ts: 0,
		room_id: "!JBxeGYnzQwLnaooOLD:cadence.moe",
		content: {
			body: "This room has been replaced",
			replacement_room: "!JBxeGYnzQwLnaooNEW:cadence.moe"
		}
	}, {
		async joinRoom(roomID) {
			called++
			t.equal(roomID, "!JBxeGYnzQwLnaooNEW:cadence.moe")
			throw new Error("access denied or something")
		},
		async usePrivateChat(sender) {
			called++
			t.equal(sender, "@cadence:cadence.moe")
			return "!private"
		},
		async sendEvent(roomID, type, content) {
			called++
			t.equal(roomID, "!private")
			t.equal(type, "m.room.message")
			t.deepEqual(content, {
				msgtype: "m.text",
				body: "You upgraded the bridged room winners. To keep bridging, I need you to invite me to the new room: https://matrix.to/#/!JBxeGYnzQwLnaooNEW:cadence.moe",
				format: "org.matrix.custom.html",
				formatted_body: `You upgraded the bridged room <strong>winners</strong>. To keep bridging, I need you to invite me to the new room: <a href="https://matrix.to/#/!JBxeGYnzQwLnaooNEW:cadence.moe">https://matrix.to/#/!JBxeGYnzQwLnaooNEW:cadence.moe</a>`
			})
		}
	})
	t.equal(called, 3)
})

test("join upgraded room: only cares about invites/joins", async t => {
	let called = 0
	await onBotMembership({
		type: "m.room.member",
		state_key: "@_ooye_bot:cadence.moe",
		room_id: "!JBxeGYnzQwLnaooNEW:cadence.moe",
		content: {
			membership: "leave"
		}
	}, {
		/* c8 ignore next 4 */
		async joinRoom(roomID) {
			called++
			throw new Error("should not join this room")
		}
	})
	t.equal(called, 0)
})

test("join upgraded room: joins invited room, updates database", async t => {
	let called = 0
	await onBotMembership({
		type: "m.room.member",
		state_key: "@_ooye_bot:cadence.moe",
		room_id: "!JBxeGYnzQwLnaooNEW:cadence.moe",
		content: {
			membership: "invite"
		}
	}, {
		async joinRoom(roomID) {
			called++
			t.equal(roomID, "!JBxeGYnzQwLnaooNEW:cadence.moe")
			return roomID
		},
		async sendState(roomID, type, key, content) {
			called++
			if (type === "m.space.child") {
				t.equal(roomID, "!CvQMeeqXIkgedUpkzv:cadence.moe") // space
				t.equal(key, "!JBxeGYnzQwLnaooOLD:cadence.moe")
				t.deepEqual(content, {})
				return "$child"
			} else if (type === "uk.half-shot.bridge") {
				t.equal(roomID, "!JBxeGYnzQwLnaooOLD:cadence.moe")
				t.equal(key, "moe.cadence.ooye://discord/1345641201902288987/598707048112193536")
				t.deepEqual(content, {})
				return "$bridge"
			}
			/* c8 ignore next */
			throw new Error(`unexpected sendState: ${roomID} - ${type}/${key}`)
		}
	}, {
		async syncRoom(channelID) {
			called++
			t.equal(channelID, "598707048112193536")
		}
	})
	t.equal(called, 4)
	t.equal(select("channel_room", "room_id", {channel_id: "598707048112193536"}).pluck().get(), "!JBxeGYnzQwLnaooNEW:cadence.moe")
	t.equal(select("historical_channel_room", "historical_room_index", {reference_channel_id: "598707048112193536"}).pluck().all().length, 2)
})
