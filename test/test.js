// @ts-check

const fs = require("fs")
const {join} = require("path")
const stp = require("stream").promises
const sqlite = require("better-sqlite3")
const migrate = require("../db/migrate")
const HeatSync = require("heatsync")
const {test} = require("supertape")
const data = require("./data")
/** @type {import("node-fetch").default} */
// @ts-ignore
const fetch = require("node-fetch")
const {green} = require("colorette")

const config = require("../config")
const passthrough = require("../passthrough")
const db = new sqlite(":memory:")

const reg = require("../matrix/read-registration")
reg.ooye.server_origin = "https://matrix.cadence.moe" // so that tests will pass even when hard-coded
reg.ooye.server_name = "cadence.moe"
reg.id = "baby" // don't actually take authenticated actions on the server
reg.as_token = "baby"
reg.hs_token = "baby"

const sync = new HeatSync({watchFS: false})

const discord = {
	guilds: new Map([
		[data.guild.general.id, data.guild.general]
	]),
	application: {
		id: "684280192553844747"
	},
	channels: new Map([
		["497161350934560778", {
			guild_id: "497159726455455754"
		}],
		["498323546729086986", {
			guild_id: "497159726455455754",
			name: "bad-boots-prison"
		}]
	])
}

Object.assign(passthrough, { discord, config, sync, db })

const orm = sync.require("../db/orm")
passthrough.from = orm.from
passthrough.select = orm.select

const file = sync.require("../matrix/file")
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
				await stp.pipeline(res.body, fs.createWriteStream(to, {encoding: "binary"}))
			}
			await allReporter([
				{url: "https://matrix.cadence.moe/_matrix/media/r0/download/cadence.moe/RLMgJGfgTPjIQtvvWZsYjhjy", to: "test/res/RLMgJGfgTPjIQtvvWZsYjhjy.png"},
				{url: "https://matrix.cadence.moe/_matrix/media/r0/download/cadence.moe/bZFuuUSEebJYXUMSxuuSuLTa", to: "test/res/bZFuuUSEebJYXUMSxuuSuLTa.png"},
				{url: "https://matrix.cadence.moe/_matrix/media/r0/download/cadence.moe/qWmbXeRspZRLPcjseyLmeyXC", to: "test/res/qWmbXeRspZRLPcjseyLmeyXC.png"},
				{url: "https://matrix.cadence.moe/_matrix/media/r0/download/cadence.moe/wcouHVjbKJJYajkhJLsyeJAA", to: "test/res/wcouHVjbKJJYajkhJLsyeJAA.png"},
				{url: "https://matrix.cadence.moe/_matrix/media/r0/download/cadence.moe/WbYqNlACRuicynBfdnPYtmvc", to: "test/res/WbYqNlACRuicynBfdnPYtmvc.gif"},
				{url: "https://matrix.cadence.moe/_matrix/media/r0/download/cadence.moe/HYcztccFIPgevDvoaWNsEtGJ", to: "test/res/HYcztccFIPgevDvoaWNsEtGJ.png"},
				{url: "https://matrix.cadence.moe/_matrix/media/r0/download/cadence.moe/lHfmJpzgoNyNtYHdAmBHxXix", to: "test/res/lHfmJpzgoNyNtYHdAmBHxXix.png"},
				{url: "https://matrix.cadence.moe/_matrix/media/r0/download/cadence.moe/MtRdXixoKjKKOyHJGWLsWLNU", to: "test/res/MtRdXixoKjKKOyHJGWLsWLNU.png"},
				{url: "https://matrix.cadence.moe/_matrix/media/r0/download/cadence.moe/HXfFuougamkURPPMflTJRxGc", to: "test/res/HXfFuougamkURPPMflTJRxGc.png"},
				{url: "https://matrix.cadence.moe/_matrix/media/r0/download/cadence.moe/ikYKbkhGhMERAuPPbsnQzZiX", to: "test/res/ikYKbkhGhMERAuPPbsnQzZiX.png"},
				{url: "https://matrix.cadence.moe/_matrix/media/r0/download/cadence.moe/AYPpqXzVJvZdzMQJGjioIQBZ", to: "test/res/AYPpqXzVJvZdzMQJGjioIQBZ.png"},
				{url: "https://matrix.cadence.moe/_matrix/media/r0/download/cadence.moe/UVuzvpVUhqjiueMxYXJiFEAj", to: "test/res/UVuzvpVUhqjiueMxYXJiFEAj.png"},
				{url: "https://ezgif.com/images/format-demo/butterfly.gif", to: "test/res/butterfly.gif"},
				{url: "https://ezgif.com/images/format-demo/butterfly.png", to: "test/res/butterfly.png"},
			])
		}, {timeout: 60000})
	}
	/* c8 ignore end */

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

	require("../db/orm.test")
	require("../discord/utils.test")
	require("../matrix/kstate.test")
	require("../matrix/api.test")
	require("../matrix/file.test")
	require("../matrix/read-registration.test")
	require("../matrix/txnid.test")
	require("../d2m/actions/create-room.test")
	require("../d2m/actions/create-space.test")
	require("../d2m/actions/register-user.test")
	require("../d2m/converters/edit-to-changes.test")
	require("../d2m/converters/emoji-to-key.test")
	require("../d2m/converters/lottie.test")
	require("../d2m/converters/message-to-event.test")
	require("../d2m/converters/message-to-event.embeds.test")
	require("../d2m/converters/message-to-event.pk.test")
	require("../d2m/converters/pins-to-list.test")
	require("../d2m/converters/remove-reaction.test")
	require("../d2m/converters/thread-to-announcement.test")
	require("../d2m/converters/user-to-mxid.test")
	require("../m2d/converters/event-to-message.test")
	require("../m2d/converters/utils.test")
	require("../m2d/converters/emoji-sheet.test")
})()
