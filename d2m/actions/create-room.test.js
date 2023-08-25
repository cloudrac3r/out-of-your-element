// @ts-check

const {channelToKState, _convertNameAndTopic} = require("./create-room")
const {kstateStripConditionals} = require("../../matrix/kstate")
const {test} = require("supertape")
const testData = require("../../test/data")

test("channel2room: general", async t => {
	t.deepEqual(
		kstateStripConditionals(await channelToKState(testData.channel.general, testData.guild.general).then(x => x.channelKState)),
		testData.room.general
	)
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
