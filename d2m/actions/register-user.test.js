const {channelToKState} = require("./create-room")
const {_memberToStateContent} = require("./register-user")
const {test} = require("supertape")
const testData = require("../../test/data")

test("member2state: without member nick or avatar", async t => {
	t.deepEqual(
		await _memberToStateContent(testData.member.kumaccino.user, testData.member.kumaccino, testData.guild.general.id),
		{
			avatar_url: "mxc://cadence.moe/UpAeIqeclhKfeiZNdIWNcXXL",
			displayname: "kumaccino",
			membership: "join",
			"moe.cadence.ooye.member": {
				avatar: "/avatars/113340068197859328/b48302623a12bc7c59a71328f72ccb39.png?size=1024"
			},
			"uk.half-shot.discord.member": {
				bot: false,
				displayColor: 10206929,
				id: "113340068197859328",
				username: "@kumaccino"
			}
		}
	)
})

test("member2state: with member nick and avatar", async t => {
	t.deepEqual(
		await _memberToStateContent(testData.member.sheep.user, testData.member.sheep, testData.guild.general.id),
		{
			avatar_url: "mxc://cadence.moe/rfemHmAtcprjLEiPiEuzPhpl",
			displayname: "The Expert's Submarine",
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
