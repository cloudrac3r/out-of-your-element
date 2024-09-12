// @ts-check

const mixin = require("@cloudrac3r/mixin-deep")
const {guildToKState, ensureSpace} = require("./create-space")
const {kstateStripConditionals, kstateUploadMxc} = require("../../matrix/kstate")
const {test} = require("supertape")
const testData = require("../../../test/data")

const passthrough = require("../../passthrough")
const {db} = passthrough

test("guild2space: can generate kstate for a guild, passing privacy level 0", async t => {
	t.deepEqual(
		await kstateUploadMxc(kstateStripConditionals(await guildToKState(testData.guild.general, 0))),
		{
			"m.room.avatar/": {
				url: "mxc://cadence.moe/zKXGZhmImMHuGQZWJEFKJbsF"
			},
			"m.room.guest_access/": {
				guest_access: "can_join"
			},
			"m.room.history_visibility/": {
				history_visibility: "invited"
			},
			"m.room.join_rules/": {
				join_rule: "invite"
			},
			"m.room.name/": {
				name: "Psychonauts 3"
			},
			"m.room.power_levels/": {
				users: {
					"@test_auto_invite:example.org": 100
				},
			},
		}
	)
})
