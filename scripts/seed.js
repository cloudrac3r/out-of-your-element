// @ts-check

const assert = require("assert").strict
const fs = require("fs")
const sqlite = require("better-sqlite3")
const {scheduler: {wait}} = require("timers/promises")
const {isDeepStrictEqual} = require("util")

const {prompt} = require("enquirer")
const Input = require("enquirer/lib/prompts/input")
const fetch = require("node-fetch")
const {magenta, bold, cyan} = require("ansi-colors")
const HeatSync = require("heatsync")

const args = require("minimist")(process.argv.slice(2), {string: ["emoji-guild"]})

const config = require("../config")
const passthrough = require("../passthrough")
const db = new sqlite("db/ooye.db")
const migrate = require("../db/migrate")

const sync = new HeatSync({watchFS: false})

Object.assign(passthrough, { sync, config, db })

const orm = sync.require("../db/orm")
passthrough.from = orm.from
passthrough.select = orm.select

const DiscordClient = require("../d2m/discord-client")
const discord = new DiscordClient(config.discordToken, "no")
passthrough.discord = discord

let registration = require("../matrix/read-registration")
let {reg, getTemplateRegistration, writeRegistration, readRegistration, registrationFilePath} = registration

function die(message) {
	console.error(message)
	process.exit(1)
}

async function uploadAutoEmoji(guild, name, filename) {
	let emoji = guild.emojis.find(e => e.name === name)
	if (!emoji) {
		console.log(`   Uploading ${name}...`)
		const data = fs.readFileSync(filename, null)
		emoji = await discord.snow.guildAssets.createEmoji(guild.id, {name, image: "data:image/png;base64," + data.toString("base64")})
	} else {
		console.log(`   Reusing ${name}...`)
	}
	db.prepare("REPLACE INTO auto_emoji (name, emoji_id, guild_id) VALUES (?, ?, ?)").run(emoji.name, emoji.id, guild.id)
	return emoji
}

async function validateHomeserverOrigin(serverUrlPrompt, url) {
	if (!url.match(/^https?:\/\//)) return "Must be a URL"
	if (url.match(/\/$/)) return "Must not end with a slash"
	process.stdout.write(magenta(" checking, please wait..."))
	try {
		var json = await fetch(`${url}/.well-known/matrix/client`).then(res => res.json())
		let baseURL = json["m.homeserver"].base_url.replace(/\/$/, "")
		if (baseURL && baseURL !== url) {
			serverUrlPrompt.initial = baseURL
			return `Did you mean: ${bold(baseURL)}? (Enter to accept)`
		}
	} catch (e) {}
	try {
		var res = await fetch(`${url}/_matrix/client/versions`)
	} catch (e) {
		return e.message
	}
	if (res.status !== 200) return `There is no Matrix server at that URL (${url}/_matrix/client/versions returned ${res.status})`
	try {
		var json = await res.json()
	} catch (e) {
		return `There is no Matrix server at that URL (${url}/_matrix/client/versions is not JSON)`
	}
	return true
}

;(async () => {
	// create registration file with prompts...
	if (!reg) {
		console.log("What is the name of your homeserver? This is the part after : in your username.")
		/** @type {{server_name: string}} */
		const serverNameResponse = await prompt({
			type: "input",
			name: "server_name",
			message: "Homeserver name"
		})
		console.log("What is the URL of your homeserver?")
		const serverUrlPrompt = new Input({
			type: "input",
			name: "server_origin",
			message: "Homeserver URL",
			initial: () => `https://${serverNameResponse.server_name}`,
			validate: url => validateHomeserverOrigin(serverUrlPrompt, url)
		})
		/** @type {{server_origin: string}} */ // @ts-ignore
		const serverUrlResponse = await serverUrlPrompt.run()
		console.log("Your Matrix homeserver needs to be able to send HTTP requests to OOYE.")
		console.log("What URL should OOYE be reachable on? Usually, the default works fine,")
		console.log("but you need to change this if you use multiple servers or containers.")
		/** @type {{url: string}} */
		const urlResponse = await prompt({
			type: "input",
			name: "url",
			message: "URL to reach OOYE",
			initial: "http://localhost:6693",
			validate: url => !!url.match(/^https?:\/\//)
		})
		const template = getTemplateRegistration()
		reg = {...template, ...urlResponse, ooye: {...template.ooye, ...serverNameResponse, ...serverUrlResponse}}
		registration.reg = reg
		writeRegistration(reg)
	}

	// Done with user prompts, reg is now guaranteed to be valid
	const api = require("../matrix/api")
	const file = require("../matrix/file")
	const utils = require("../m2d/converters/utils")

	console.log(`✅ Registration file saved as ${registrationFilePath}`)
	console.log(`  In ${cyan("Synapse")}, you need to add it to homeserver.yaml and ${cyan("restart Synapse")}.`)
	console.log("    https://element-hq.github.io/synapse/latest/application_services.html")
	console.log(`  In ${cyan("Conduit")}, you need to send the file contents to the #admins room.`)
	console.log("    https://docs.conduit.rs/appservices.html")
	console.log()

	const {as} = require("../matrix/appservice")
	console.log("⏳ Waiting until homeserver registration works... (Ctrl+C to cancel)")

	let itWorks = false
	let lastError = null
	do {
		const result = await api.ping().catch(e => ({ok: false, status: "net", root: e.message}))
		// If it didn't work, log details and retry after some time
		itWorks = result.ok
		if (!itWorks) {
			// Log the full error data if the error is different to last time
			if (!isDeepStrictEqual(lastError, result.root)) {
				if (typeof result.root === "string") {
					console.log(`\nCannot reach homeserver: ${result.root}`)
				} else if (result.root.error) {
					console.log(`\nHomeserver said: [${result.status}] ${result.root.error}`)
				} else {
					console.log(`\nHomeserver said: [${result.status}] ${JSON.stringify(result.root)}`)
				}
				lastError = result.root
			} else {
				process.stderr.write(".")
			}
			await wait(5000)
		}
	} while (!itWorks)
	console.log("")

	as.close().catch(() => {})

	console.log("⏩ Processing. This could take up to 30 seconds. Please be patient...")

	const mxid = `@${reg.sender_localpart}:${reg.ooye.server_name}`

	// ensure registration is correctly set...
	assert(reg.sender_localpart.startsWith(reg.ooye.namespace_prefix), "appservice's localpart must be in the namespace it controls")
	assert(utils.eventSenderIsFromDiscord(mxid), "appservice's mxid must be in the namespace it controls")
	assert(reg.ooye.server_origin.match(/^https?:\/\//), "server origin must start with http or https")
	assert.notEqual(reg.ooye.server_origin.slice(-1), "/", "server origin must not end in slash")
	const botID = Buffer.from(config.discordToken.split(".")[0], "base64").toString()
	assert(botID.match(/^[0-9]{10,}$/), "discord token must follow the correct format")
	assert.match(reg.url, /^https?:/, "url must start with http:// or https://")

	console.log("✅ Configuration looks good...")

	// database ddl...
	await migrate.migrate(db)

	// add initial rows to database, like adding the bot to sim...
	db.prepare("INSERT OR IGNORE INTO sim (user_id, sim_name, localpart, mxid) VALUES (?, ?, ?, ?)").run(botID, reg.sender_localpart.slice(reg.ooye.namespace_prefix.length), reg.sender_localpart, mxid)

	console.log("✅ Database is ready...")

	// ensure appservice bot user is registered...
	try {
		await api.register(reg.sender_localpart)
	} catch (e) {
		if (e.errcode === "M_USER_IN_USE" || e.data?.error === "Internal server error") {
			// "Internal server error" is the only OK error because older versions of Synapse say this if you try to register the same username twice.
		} else {
			throw e
		}
	}

	// upload initial images...
	const avatarUrl = await file.uploadDiscordFileToMxc("https://cadence.moe/friends/out_of_your_element.png")

	console.log("✅ Matrix appservice login works...")

	// upload the L1 L2 emojis to some guild
	const emojis = db.prepare("SELECT name FROM auto_emoji WHERE name = 'L1' OR name = 'L2'").pluck().all()
	if (emojis.length !== 2) {
		// If an argument was supplied, always use that one
		let guild = null
		if (args["emoji-guild"]) {
			if (typeof args["emoji-guild"] === "string") {
				guild = await discord.snow.guild.getGuild(args["emoji-guild"])
			}
			if (!guild) return die(`Error: You asked emojis to be uploaded to guild ID ${args["emoji-guild"]}, but the bot isn't in that guild.`)
		}
		// Otherwise, check if we have already registered an auto emoji guild
		if (!guild) {
			const guildID = passthrough.select("auto_emoji", "guild_id", {name: "_"}).pluck().get()
			if (guildID) {
				guild = await discord.snow.guild.getGuild(guildID, false)
			}
		}
		// Otherwise, check if we should create a new guild
		if (!guild) {
			const guilds = await discord.snow.user.getGuilds({limit: 11, with_counts: false})
			if (guilds.length < 10) {
				console.log("   Creating a guild for emojis...")
				guild = await discord.snow.guild.createGuild({name: "OOYE Emojis"})
			}
		}
		// Otherwise, it's the user's problem
		if (!guild) {
			return die(`Error: The bot needs to upload some emojis. Please say where to upload them to. Run seed.js again with --emoji-guild=GUILD_ID`)
		}
		// Upload those emojis to the chosen location
		db.prepare("REPLACE INTO auto_emoji (name, emoji_id, guild_id) VALUES ('_', '_', ?)").run(guild.id)
		await uploadAutoEmoji(guild, "L1", "docs/img/L1.png")
		await uploadAutoEmoji(guild, "L2", "docs/img/L2.png")
	}
	console.log("✅ Emojis are ready...")

	// set profile data on discord...
	const avatarImageBuffer = await fetch("https://cadence.moe/friends/out_of_your_element.png").then(res => res.arrayBuffer())
	await discord.snow.user.updateSelf({avatar: "data:image/png;base64," + Buffer.from(avatarImageBuffer).toString("base64")})
	await discord.snow.requestHandler.request(`/applications/@me`, {}, "patch", "json", {description: "Powered by **Out Of Your Element**\nhttps://gitdab.com/cadence/out-of-your-element"})
	console.log("✅ Discord profile updated...")

	// set profile data on homeserver...
	await api.profileSetDisplayname(mxid, "Out Of Your Element")
	await api.profileSetAvatarUrl(mxid, avatarUrl)
	console.log("✅ Matrix profile updated...")

	console.log("Good to go. I hope you enjoy Out Of Your Element.")
	process.exit()
})()
