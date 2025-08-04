const {_memberToStateContent, _memberToPowerLevel} = require("./register-user")
const {test} = require("supertape")
const data = require("../../../test/data")
const mixin = require("@cloudrac3r/mixin-deep")
const DiscordTypes = require("discord-api-types/v10")

test("member2state: without member nick or avatar", async t => {
	t.deepEqual(
		await _memberToStateContent(data.member.kumaccino.user, data.member.kumaccino, data.guild.general.id),
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

test("member2state: with global name, without member nick or avatar", async t => {
	t.deepEqual(
		await _memberToStateContent(data.member.papiophidian.user, data.member.papiophidian, data.guild.general.id),
		{
			avatar_url: "mxc://cadence.moe/JPzSmALLirnIprlSMKohSSoX",
			displayname: "PapiOphidian",
			membership: "join",
			"moe.cadence.ooye.member": {
				avatar: "/avatars/320067006521147393/5fc4ad85c1ea876709e9a7d3374a78a1.png?size=1024"
			},
			"uk.half-shot.discord.member": {
				bot: false,
				displayColor: 1579292,
				id: "320067006521147393",
				username: "@papiophidian"
			}
		}
	)
})

test("member2state: with member nick and avatar", async t => {
	t.deepEqual(
		await _memberToStateContent(data.member.sheep.user, data.member.sheep, data.guild.general.id),
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

test("member2power: default to zero if member roles unknown", async t => {
	const power = _memberToPowerLevel(data.user.clyde_ai, null, data.guild.data_horde, data.channel.saving_the_world)
	t.equal(power, 0)
})

test("member2power: unremarkable = 0", async t => {
	const power = _memberToPowerLevel(data.user.clyde_ai, {
		roles: []
	}, data.guild.data_horde, data.channel.general)
	t.equal(power, 0)
})

test("member2power: can mention everyone = 20", async t => {
	const power = _memberToPowerLevel(data.user.clyde_ai, {
		roles: ["684524730274807911"]
	}, data.guild.data_horde, data.channel.general)
	t.equal(power, 20)
})

test("member2power: can send messages in protected channel due to role = 50", async t => {
	const power = _memberToPowerLevel(data.user.clyde_ai, {
		roles: ["684524730274807911"]
	}, data.guild.data_horde, data.channel.saving_the_world)
	t.equal(power, 50)
})

test("member2power: can send messages in protected channel due to user override = 50", async t => {
	const power = _memberToPowerLevel(data.user.clyde_ai, {
		roles: []
	}, data.guild.data_horde, mixin({}, data.channel.saving_the_world, {
		permission_overwrites: data.channel.saving_the_world.permission_overwrites.concat({
			type: DiscordTypes.OverwriteType.member,
			id: data.user.clyde_ai.id,
			allow: String(DiscordTypes.PermissionFlagsBits.SendMessages),
			deny: "0"
		})
	}))
	t.equal(power, 50)
})

test("member2power: can kick users = 50", async t => {
	const power = _memberToPowerLevel(data.user.clyde_ai, {
		roles: ["682789592390281245"]
	}, data.guild.data_horde, data.channel.general)
	t.equal(power, 50)
})

test("member2power: can manage channels = 100", async t => {
	const power = _memberToPowerLevel(data.user.clyde_ai, {
		roles: ["665290147377578005"]
	}, data.guild.data_horde, data.channel.saving_the_world)
	t.equal(power, 100)
})

test("member2power: pathfinder use case", async t => {
	const power = _memberToPowerLevel(data.user.jerassicore, {
		roles: ["1235396773510647810", "1359752622130593802", "1249165855632265267", "1380768596929806356", "1380756348190462015"]
	}, data.guild.pathfinder, data.channel.character_art)
	t.equal(power, 50)
})
