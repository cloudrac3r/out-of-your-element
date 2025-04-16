// @ts-check

const mixin = require("@cloudrac3r/mixin-deep")
const {channelToKState, _convertNameAndTopic} = require("./create-room")
const {kstateStripConditionals} = require("../../matrix/kstate")
const {test} = require("supertape")
const testData = require("../../../test/data")

const passthrough = require("../../passthrough")
const {db} = passthrough


test("channel2room: discoverable privacy room", async t => {
	let called = 0
	async function getStateEvent(roomID, type, key) { // getting power levels from space to apply to room
		called++
		t.equal(roomID, "!jjmvBegULiLucuWEHU:cadence.moe")
		t.equal(type, "m.room.power_levels")
		t.equal(key, "")
		return {users: {"@example:matrix.org": 50}}
	}
	db.prepare("UPDATE guild_space SET privacy_level = 2").run()
	t.deepEqual(
		kstateStripConditionals(await channelToKState(testData.channel.general, testData.guild.general, {api: {getStateEvent}}).then(x => x.channelKState)),
		Object.assign({}, testData.room.general, {
			"m.room.guest_access/": {guest_access: "forbidden"},
			"m.room.join_rules/": {join_rule: "public"},
			"m.room.history_visibility/": {history_visibility: "world_readable"},
			"m.room.power_levels/": mixin({users: {"@example:matrix.org": 50}}, testData.room.general["m.room.power_levels/"])
		})
	)
	t.equal(called, 1)
})

test("channel2room: linkable privacy room", async t => {
	let called = 0
	async function getStateEvent(roomID, type, key) { // getting power levels from space to apply to room
		called++
		t.equal(roomID, "!jjmvBegULiLucuWEHU:cadence.moe")
		t.equal(type, "m.room.power_levels")
		t.equal(key, "")
		return {users: {"@example:matrix.org": 50}}
	}
	db.prepare("UPDATE guild_space SET privacy_level = 1").run()
	t.deepEqual(
		kstateStripConditionals(await channelToKState(testData.channel.general, testData.guild.general, {api: {getStateEvent}}).then(x => x.channelKState)),
		Object.assign({}, testData.room.general, {
			"m.room.guest_access/": {guest_access: "forbidden"},
			"m.room.join_rules/": {join_rule: "public"},
			"m.room.power_levels/": mixin({users: {"@example:matrix.org": 50}}, testData.room.general["m.room.power_levels/"])
		})
	)
	t.equal(called, 1)
})

test("channel2room: invite-only privacy room", async t => {
	let called = 0
	async function getStateEvent(roomID, type, key) { // getting power levels from space to apply to room
		called++
		t.equal(roomID, "!jjmvBegULiLucuWEHU:cadence.moe")
		t.equal(type, "m.room.power_levels")
		t.equal(key, "")
		return {users: {"@example:matrix.org": 50}}
	}
	db.prepare("UPDATE guild_space SET privacy_level = 0").run()
	t.deepEqual(
		kstateStripConditionals(await channelToKState(testData.channel.general, testData.guild.general, {api: {getStateEvent}}).then(x => x.channelKState)),
		Object.assign({}, testData.room.general, {
			"m.room.power_levels/": mixin({users: {"@example:matrix.org": 50}}, testData.room.general["m.room.power_levels/"])
		})
	)
	t.equal(called, 1)
})

test("channel2room: room where limited people can mention everyone", async t => {
	let called = 0
	async function getStateEvent(roomID, type, key) { // getting power levels from space to apply to room
		called++
		t.equal(roomID, "!jjmvBegULiLucuWEHU:cadence.moe")
		t.equal(type, "m.room.power_levels")
		t.equal(key, "")
		return {users: {"@example:matrix.org": 50}}
	}
	const limitedGuild = mixin({}, testData.guild.general)
	limitedGuild.roles[0].permissions = (BigInt(limitedGuild.roles[0].permissions) - 131072n).toString()
	const limitedRoom = mixin({}, testData.room.general, {"m.room.power_levels/": {
		notifications: {room: 20},
		users: {"@example:matrix.org": 50}
	}})
	t.deepEqual(
		kstateStripConditionals(await channelToKState(testData.channel.general, limitedGuild, {api: {getStateEvent}}).then(x => x.channelKState)),
		limitedRoom
	)
	t.equal(called, 1)
})

test("channel2room: matrix room that already has a custom topic set", async t => {
	let called = 0
	async function getStateEvent(roomID, type, key) { // getting power levels from space to apply to room
		called++
		t.equal(roomID, "!jjmvBegULiLucuWEHU:cadence.moe")
		t.equal(type, "m.room.power_levels")
		t.equal(key, "")
		return {}
	}
	db.prepare("UPDATE channel_room SET custom_topic = 1 WHERE channel_id = ?").run(testData.channel.general.id)
	const expected = mixin({}, testData.room.general, {"m.room.power_levels/": {notifications: {room: 20}}})
	// @ts-ignore
	delete expected["m.room.topic/"]
	t.deepEqual(
		kstateStripConditionals(await channelToKState(testData.channel.general, testData.guild.general, {api: {getStateEvent}}).then(x => x.channelKState)),
		expected
	)
	t.equal(called, 1)
})

test("channel2room: read-only discord channel", async t => {
	let called = 0
	async function getStateEvent(roomID, type, key) { // getting power levels from space to apply to room
		called++
		t.equal(roomID, "!jjmvBegULiLucuWEHU:cadence.moe")
		t.equal(type, "m.room.power_levels")
		t.equal(key, "")
		return {}
	}
	const expected = {
		"chat.schildi.hide_ui/read_receipts": {},
		"m.room.avatar/": {
			url: {
				$url: "/icons/112760669178241024/a_f83622e09ead74f0c5c527fe241f8f8c.png?size=1024",
			},
		},
		"m.room.guest_access/": {
			guest_access: "can_join",
		},
		"m.room.history_visibility/": {
			history_visibility: "shared",
		},
		"m.room.join_rules/": {
			allow: [
				{
					room_id: "!jjmvBegULiLucuWEHU:cadence.moe",
					type: "m.room_membership",
				},
			],
			join_rule: "restricted",
		},
		"m.room.name/": {
			name: "updates",
		},
		"m.room.topic/": {
      	topic: "Updates and release announcements for Out Of Your Element.\n\nChannel ID: 1161864271370666075\nGuild ID: 112760669178241024"
		},
		"m.room.power_levels/": {
			events_default: 50, // <-- it should be read-only!
			events: {
				"m.reaction": 0,
				"m.room.redaction": 0
			},
			notifications: {
				room: 20,
			},
			users: {
				"@test_auto_invite:example.org": 100,
			},
		},
		"m.space.parent/!jjmvBegULiLucuWEHU:cadence.moe": {
			canonical: true,
			via: [
				"cadence.moe",
			],
		},
		"uk.half-shot.bridge/moe.cadence.ooye://discord/112760669178241024/1161864271370666075": {
			bridgebot: "@_ooye_bot:cadence.moe",
			channel: {
				displayname: "updates",
				external_url: "https://discord.com/channels/112760669178241024/1161864271370666075",
				id: "1161864271370666075",
			},
			network: {
				avatar_url: {
					"$url": "/icons/112760669178241024/a_f83622e09ead74f0c5c527fe241f8f8c.png?size=1024",
				},
				displayname: "Psychonauts 3",
				id: "112760669178241024",
			},
			protocol: {
				displayname: "Discord",
				id: "discord",
			}
		}
	}
	t.deepEqual(
		kstateStripConditionals(await channelToKState(testData.channel.updates, testData.guild.general, {api: {getStateEvent}}).then(x => x.channelKState)),
		expected
	)
	t.equal(called, 1)
})

test("convertNameAndTopic: custom name and topic", t => {
	t.deepEqual(
		_convertNameAndTopic({id: "123", name: "the-twilight-zone", topic: "Spooky stuff here. :ghost:", type: 0}, {id: "456"}, "hauntings"),
		["hauntings", "#the-twilight-zone | Spooky stuff here. :ghost:\n\nChannel ID: 123\nGuild ID: 456"]
	)
})

test("convertNameAndTopic: custom name, no topic", t => {
	t.deepEqual(
		_convertNameAndTopic({id: "123", name: "the-twilight-zone", type: 0}, {id: "456"}, "hauntings"),
		["hauntings", "#the-twilight-zone\n\nChannel ID: 123\nGuild ID: 456"]
	)
})

test("convertNameAndTopic: original name and topic", t => {
	t.deepEqual(
		_convertNameAndTopic({id: "123", name: "the-twilight-zone", topic: "Spooky stuff here. :ghost:", type: 0}, {id: "456"}, null),
		["the-twilight-zone", "Spooky stuff here. :ghost:\n\nChannel ID: 123\nGuild ID: 456"]
	)
})

test("convertNameAndTopic: original name, no topic", t => {
	t.deepEqual(
		_convertNameAndTopic({id: "123", name: "the-twilight-zone", type: 0}, {id: "456"}, null),
		["the-twilight-zone", "Channel ID: 123\nGuild ID: 456"]
	)
})

test("convertNameAndTopic: public thread icon", t => {
	t.deepEqual(
		_convertNameAndTopic({id: "123", name: "the-twilight-zone", topic: "Spooky stuff here. :ghost:", type: 11}, {id: "456"}, null),
		["[⛓️] the-twilight-zone", "Spooky stuff here. :ghost:\n\nChannel ID: 123\nGuild ID: 456"]
	)
})

test("convertNameAndTopic: private thread icon", t => {
	t.deepEqual(
		_convertNameAndTopic({id: "123", name: "the-twilight-zone", topic: "Spooky stuff here. :ghost:", type: 12}, {id: "456"}, null),
		["[🔒⛓️] the-twilight-zone", "Spooky stuff here. :ghost:\n\nChannel ID: 123\nGuild ID: 456"]
	)
})

test("convertNameAndTopic: voice channel icon", t => {
	t.deepEqual(
		_convertNameAndTopic({id: "123", name: "the-twilight-zone", topic: "Spooky stuff here. :ghost:", type: 2}, {id: "456"}, null),
		["[🔊] the-twilight-zone", "Spooky stuff here. :ghost:\n\nChannel ID: 123\nGuild ID: 456"]
	)
})
