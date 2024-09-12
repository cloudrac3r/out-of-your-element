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
		t.equal(roomID, "!jjWAGMeQdNrVZSSfvz:cadence.moe")
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
		t.equal(roomID, "!jjWAGMeQdNrVZSSfvz:cadence.moe")
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
		t.equal(roomID, "!jjWAGMeQdNrVZSSfvz:cadence.moe")
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
		t.equal(roomID, "!jjWAGMeQdNrVZSSfvz:cadence.moe")
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
