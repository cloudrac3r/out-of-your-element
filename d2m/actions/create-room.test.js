const {channelToKState} = require("./create-room")
const {kstateStripConditionals} = require("../../matrix/kstate")
const {test} = require("supertape")
const testData = require("../../test/data")

test("channel2room: general", async t => {
	t.deepEqual(
		kstateStripConditionals(await channelToKState(testData.channel.general, testData.guild.general).then(x => x.channelKState)),
		testData.room.general
	)
})
