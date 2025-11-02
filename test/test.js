// @ts-check

const fs = require("fs")
const {join} = require("path")
const sqlite = require("better-sqlite3")
const {Writable} = require("stream")
const migrate = require("../src/db/migrate")
const HeatSync = require("heatsync")
const {test, extend} = require("supertape")
const data = require("./data")
const {green} = require("ansi-colors")

const passthrough = require("../src/passthrough")
const db = new sqlite(":memory:")

const {reg} = require("../src/matrix/read-registration")
reg.ooye.discord_token = "Njg0MjgwMTkyNTUzODQ0NzQ3.Xl3zlw.baby"
reg.ooye.server_origin = "https://matrix.cadence.moe" // so that tests will pass even when hard-coded
reg.ooye.server_name = "cadence.moe"
reg.ooye.namespace_prefix = "_ooye_"
reg.sender_localpart = "_ooye_bot"
reg.id = "baby"
reg.as_token = "don't actually take authenticated actions on the server"
reg.hs_token = "don't actually take authenticated actions on the server"
reg.namespaces = {
	users: [{regex: "@_ooye_.*:cadence.moe", exclusive: true}],
	aliases: [{regex: "#_ooye_.*:cadence.moe", exclusive: true}]
}
reg.ooye.bridge_origin = "https://bridge.example.org"
reg.ooye.time_zone = "Pacific/Auckland"

const sync = new HeatSync({watchFS: false})

const discord = {
	// @ts-ignore - ignore guilds, because my data dump is missing random properties
	guilds: new Map([
		[data.guild.general.id, data.guild.general],
		[data.guild.fna.id, data.guild.fna],
		[data.guild.data_horde.id, data.guild.data_horde]
	]),
	guildChannelMap: new Map([
		[data.guild.general.id, [data.channel.general.id, data.channel.updates.id]],
		[data.guild.fna.id, []],
		[data.guild.data_horde.id, [data.channel.saving_the_world.id]]
	]),
	application: {
		id: "684280192553844747"
	},
	// @ts-ignore - ignore channels, because my data dump is missing random properties
	channels: new Map([
		[data.channel.general.id, data.channel.general],
		[data.channel.updates.id, data.channel.updates],
		["497161350934560778", {
			guild_id: "497159726455455754"
		}],
		["498323546729086986", {
			guild_id: "497159726455455754",
			name: "bad-boots-prison"
		}],
		[data.channel.saving_the_world.id, data.channel.saving_the_world]
	])
}

Object.assign(passthrough, { discord, sync, db })

const orm = sync.require("../src/db/orm")
passthrough.from = orm.from
passthrough.select = orm.select

const file = sync.require("../src/matrix/file")
/* c8 ignore next */
file._actuallyUploadDiscordFileToMxc = function(url, res) { throw new Error(`Not allowed to upload files during testing.\nURL: ${url}`) }

;(async () => {
	/* c8 ignore start - maybe download some more test files in slow mode */
	if (process.argv.includes("--slow")) {
		test("test files: download", async t => {
			/** @param {{url: string, to: string}[]} files */
			async function allReporter(files) {
				return new Promise(resolve => {
					let resolved = 0
					const report = files.map(file => file.to.split("/").slice(-1)[0][0])
					files.map(download).forEach((p, i) => {
						p.then(() => {
							report[i] = green(".")
							process.stderr.write("\r" + report.join(""))
							if (++resolved === files.length) resolve(null)
						})
					})
				})
			}
			async function download({url, to}) {
				if (await fs.existsSync(to)) return
				const res = await fetch(url)
				// @ts-ignore
				await res.body.pipeTo(Writable.toWeb(fs.createWriteStream(to, {encoding: "binary"})))
			}
			await allReporter([
				{url: "https://cadence.moe/friends/ooye_test/RLMgJGfgTPjIQtvvWZsYjhjy.png", to: "test/res/RLMgJGfgTPjIQtvvWZsYjhjy.png"},
				{url: "https://cadence.moe/friends/ooye_test/bZFuuUSEebJYXUMSxuuSuLTa.png", to: "test/res/bZFuuUSEebJYXUMSxuuSuLTa.png"},
				{url: "https://cadence.moe/friends/ooye_test/qWmbXeRspZRLPcjseyLmeyXC.png", to: "test/res/qWmbXeRspZRLPcjseyLmeyXC.png"},
				{url: "https://cadence.moe/friends/ooye_test/wcouHVjbKJJYajkhJLsyeJAA.png", to: "test/res/wcouHVjbKJJYajkhJLsyeJAA.png"},
				{url: "https://cadence.moe/friends/ooye_test/WbYqNlACRuicynBfdnPYtmvc.gif", to: "test/res/WbYqNlACRuicynBfdnPYtmvc.gif"},
				{url: "https://cadence.moe/friends/ooye_test/HYcztccFIPgevDvoaWNsEtGJ.png", to: "test/res/HYcztccFIPgevDvoaWNsEtGJ.png"},
				{url: "https://cadence.moe/friends/ooye_test/lHfmJpzgoNyNtYHdAmBHxXix.png", to: "test/res/lHfmJpzgoNyNtYHdAmBHxXix.png"},
				{url: "https://cadence.moe/friends/ooye_test/MtRdXixoKjKKOyHJGWLsWLNU.png", to: "test/res/MtRdXixoKjKKOyHJGWLsWLNU.png"},
				{url: "https://cadence.moe/friends/ooye_test/HXfFuougamkURPPMflTJRxGc.png", to: "test/res/HXfFuougamkURPPMflTJRxGc.png"},
				{url: "https://cadence.moe/friends/ooye_test/ikYKbkhGhMERAuPPbsnQzZiX.png", to: "test/res/ikYKbkhGhMERAuPPbsnQzZiX.png"},
				{url: "https://cadence.moe/friends/ooye_test/AYPpqXzVJvZdzMQJGjioIQBZ.png", to: "test/res/AYPpqXzVJvZdzMQJGjioIQBZ.png"},
				{url: "https://cadence.moe/friends/ooye_test/UVuzvpVUhqjiueMxYXJiFEAj.png", to: "test/res/UVuzvpVUhqjiueMxYXJiFEAj.png"},
				{url: "https://ezgif.com/images/format-demo/butterfly.gif", to: "test/res/butterfly.gif"},
				{url: "https://ezgif.com/images/format-demo/butterfly.png", to: "test/res/butterfly.png"},
			])
		}, {timeout: 60000})
	}
	/* c8 ignore stop */

	const p = migrate.migrate(db)
	test("migrate: migration works", async t => {
		await p
		t.pass("it did not throw an error")
	})
	await p

	test("migrate: migration works the second time", async t => {
		await migrate.migrate(db)
		t.pass("it did not throw an error")
	})

	db.exec(fs.readFileSync(join(__dirname, "ooye-test-data.sql"), "utf8"))

	require("./addbot.test")
	require("../src/db/orm.test")
	require("../src/web/server.test")
	require("../src/web/routes/download-discord.test")
	require("../src/web/routes/download-matrix.test")
	require("../src/web/routes/guild.test")
	require("../src/web/routes/guild-settings.test")
	require("../src/web/routes/info.test")
	require("../src/web/routes/link.test")
	require("../src/web/routes/log-in-with-matrix.test")
	require("../src/discord/utils.test")
	require("../src/matrix/kstate.test")
	require("../src/matrix/api.test")
	require("../src/matrix/file.test")
	require("../src/matrix/mreq.test")
	require("../src/matrix/read-registration.test")
	require("../src/matrix/txnid.test")
	require("../src/d2m/actions/create-room.test")
	require("../src/d2m/actions/create-space.test")
	require("../src/d2m/actions/register-user.test")
	require("../src/d2m/converters/edit-to-changes.test")
	require("../src/d2m/converters/emoji-to-key.test")
	require("../src/d2m/converters/lottie.test")
	require("../src/d2m/converters/message-to-event.test")
	require("../src/d2m/converters/message-to-event.embeds.test")
	require("../src/d2m/converters/message-to-event.pk.test")
	require("../src/d2m/converters/pins-to-list.test")
	require("../src/d2m/converters/remove-reaction.test")
	require("../src/d2m/converters/thread-to-announcement.test")
	require("../src/d2m/converters/user-to-mxid.test")
	require("../src/m2d/event-dispatcher.test")
	require("../src/m2d/converters/diff-pins.test")
	require("../src/m2d/converters/event-to-message.test")
	require("../src/m2d/converters/emoji.test")
	require("../src/m2d/converters/utils.test")
	require("../src/m2d/converters/emoji-sheet.test")
	require("../src/discord/interactions/invite.test")
	require("../src/discord/interactions/matrix-info.test")
	require("../src/discord/interactions/permissions.test")
	require("../src/discord/interactions/privacy.test")
	require("../src/discord/interactions/reactions.test")
})()
