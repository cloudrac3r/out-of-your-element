const {channelToKState} = require("./create-room")
const {_memberToStateContent} = require("./register-user")
const {test} = require("supertape")
const testData = require("../../test/data")

test("member2state: general", async t => {
	t.deepEqual(
		await _memberToStateContent(testData.member.sheep.user, testData.member.sheep, testData.guild.general.id),
		{
			avatar_url: "mxc://cadence.moe/rfemHmAtcprjLEiPiEuzPhpl",
			displayname: "The Expert's Submarine | aprilsong",
			membership: "join",
			"moe.cadence.ooye.member": {
				avatar: "/guilds/112760669178241024/users/134826546694193153/avatars/38dd359aa12bcd52dd3164126c587f8c.png?size=1024"
			},
			"uk.half-shot.discord.member": {
				bot: false,
				displayColor: null,
				id: "134826546694193153",
				username: "@aprilsong"
			}
		}
	)
})
