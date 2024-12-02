#!/usr/bin/env node
// @ts-check

const assert = require("assert").strict
const fs = require("fs")
const sqlite = require("better-sqlite3")
const {scheduler} = require("timers/promises")
const {isDeepStrictEqual} = require("util")
const {createServer} = require("http")
const {join} = require("path")

const {prompt} = require("enquirer")
const Input = require("enquirer/lib/prompts/input")
const fetch = require("node-fetch").default
const {magenta, bold, cyan} = require("ansi-colors")
const HeatSync = require("heatsync")
const {SnowTransfer} = require("snowtransfer")
const {createApp, defineEventHandler, toNodeListener} = require("h3")

const args = require("minimist")(process.argv.slice(2), {string: ["emoji-guild"]})

// Move database file if it's still in the old location
if (fs.existsSync("db")) {
	if (fs.existsSync("db/ooye.db")) {
		fs.renameSync("db/ooye.db", "ooye.db")
	}
	const files = fs.readdirSync("db")
	if (files.length) {
		console.error("The db folder is deprecated and must be removed. Your ooye.db database file has already been moved to the root of the repo. You must manually move or delete the remaining files:")
		for (const file of files) {
			console.error(file)
		}
		process.exit(1)
	}
	fs.rmSync("db", {recursive: true})
}

const passthrough = require("../src/passthrough")
const db = new sqlite("ooye.db")
const migrate = require("../src/db/migrate")

const sync = new HeatSync({watchFS: false})

Object.assign(passthrough, {sync, db})

const orm = sync.require("../src/db/orm")
passthrough.from = orm.from
passthrough.select = orm.select

let registration = require("../src/matrix/read-registration")
let {reg, getTemplateRegistration, writeRegistration, readRegistration, checkRegistration, registrationFilePath} = registration

function die(message) {
	console.error(message)
	process.exit(1)
}

async function uploadAutoEmoji(snow, guild, name, filename) {
	let emoji = guild.emojis.find(e => e.name === name)
	if (!emoji) {
		console.log(`   Uploading ${name}...`)
		const data = fs.readFileSync(filename, null)
		emoji = await snow.guildAssets.createEmoji(guild.id, {name, image: "data:image/png;base64," + data.toString("base64")})
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
		if (!Array.isArray(json?.versions) || !json.versions.includes("v1.11")) {
			return `OOYE needs Matrix version v1.11, but ${url} doesn't support this`
		}
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
			message: "Homeserver name",
			validate: serverName => !!serverName.match(/[a-z][a-z.]+[a-z]/)
		})

		console.log("What is the URL of your homeserver?")
		const serverOriginPrompt = new Input({
			type: "input",
			name: "server_origin",
			message: "Homeserver URL",
			initial: () => `https://${serverNameResponse.server_name}`,
			validate: url => validateHomeserverOrigin(serverOriginPrompt, url)
		})
		/** @type {string} */ // @ts-ignore
		const serverOrigin = await serverOriginPrompt.run()

		const app = createApp()
		app.use(defineEventHandler(() => "Out Of Your Element is listening.\n"))
		const server = createServer(toNodeListener(app))
		await server.listen(6693)

		console.log("OOYE has its own web server. It needs to be accessible on the public internet.")
		console.log("You need to enter a public URL where you will be able to host this web server.")
		console.log("OOYE listens on localhost:6693, so you will probably have to set up a reverse proxy.")
		console.log("Now listening on port 6693. Feel free to send some test requests.")
		/** @type {{bridge_origin: string}} */
		const bridgeOriginResponse = await prompt({
			type: "input",
			name: "bridge_origin",
			message: "URL to reach OOYE",
			initial: () => `https://bridge.${serverNameResponse.server_name}`,
			validate: async url => {
				process.stdout.write(magenta(" checking, please wait..."))
				try {
					const res = await fetch(url)
					if (res.status !== 200) return `Server returned status code ${res.status}`
					const text = await res.text()
					if (text !== "Out Of Your Element is listening.\n") return `Server does not point to OOYE`
					return true
				} catch (e) {
					return e.message
				}
			}
		})
		bridgeOriginResponse.bridge_origin = bridgeOriginResponse.bridge_origin.replace(/\/+$/, "") // remove trailing slash

		await server.close()

		console.log("What is your Discord bot token?")
		/** @type {SnowTransfer} */ // @ts-ignore
		let snow = null
		/** @type {{id: string, redirect_uris: string[]}} */ // @ts-ignore
		let client = null
		/** @type {{discord_token: string}} */
		const discordTokenResponse = await prompt({
			type: "input",
			name: "discord_token",
			message: "Bot token",
			validate: async token => {
				process.stdout.write(magenta(" checking, please wait..."))
				try {
					snow = new SnowTransfer(token)
					client = await snow.requestHandler.request(`/applications/@me`, {}, "get")
					return true
				} catch (e) {
					return e.message
				}
			}
		})

		console.log("What is your Discord client secret?")
		console.log(`You can find it on the application page: https://discord.com/developers/applications/${client.id}/oauth2`)
		/** @type {{discord_client_secret: string}} */
		const clientSecretResponse = await prompt({
			type: "input",
			name: "discord_client_secret",
			message: "Client secret"
		})

		const expectedUri = `${bridgeOriginResponse.bridge_origin}/oauth`
		if (!client.redirect_uris.includes(expectedUri)) {
			console.log(`On the same application page, go to the Redirects section, and add this URI: ${cyan(expectedUri)}`)
			await prompt({
				type: "invisible",
				name: "redirect_uri",
				message: "Press Enter when you've added it",
				validate: async token => {
					process.stdout.write(magenta("checking, please wait..."))
					client = await snow.requestHandler.request(`/applications/@me`, {}, "get")
					if (client.redirect_uris.includes(expectedUri)) {
						return true
					} else {
						return "Redirect URI has not been added yet"
					}
				}
			})
		}

		const template = getTemplateRegistration(serverNameResponse.server_name)
		reg = {
			...template,
			url: bridgeOriginResponse.bridge_origin,
			ooye: {
				...template.ooye,
				...bridgeOriginResponse,
				server_origin: serverOrigin,
				...discordTokenResponse,
				...clientSecretResponse
			}
		}
		registration.reg = reg
		checkRegistration(reg)
		writeRegistration(reg)
		console.log(`✅ Registration file saved as ${registrationFilePath}`)
	} else {
		console.log(`✅ Valid registration file found at ${registrationFilePath}`)
	}
	console.log(`  In ${cyan("Synapse")}, you need to add it to homeserver.yaml and ${cyan("restart Synapse")}.`)
	console.log("    https://element-hq.github.io/synapse/latest/application_services.html")
	console.log(`  In ${cyan("Conduit")}, you need to send the file contents to the #admins room.`)
	console.log("    https://docs.conduit.rs/appservices.html")
	console.log()

	// Done with user prompts, reg is now guaranteed to be valid
	const api = require("../src/matrix/api")
	const file = require("../src/matrix/file")
	const DiscordClient = require("../src/d2m/discord-client")
	const discord = new DiscordClient(reg.ooye.discord_token, "no")
	passthrough.discord = discord

	const {as} = require("../src/matrix/appservice")
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
			await scheduler.wait(5000)
		}
	} while (!itWorks)
	console.log("")

	as.close().catch(() => {})

	const mxid = `@${reg.sender_localpart}:${reg.ooye.server_name}`

	// database ddl...
	await migrate.migrate(db)

	// add initial rows to database, like adding the bot to sim...
	const botID = Buffer.from(reg.ooye.discord_token.split(".")[0], "base64").toString()
	db.prepare("INSERT OR IGNORE INTO sim (user_id, sim_name, localpart, mxid) VALUES (?, ?, ?, ?)").run(botID, reg.sender_localpart.slice(reg.ooye.namespace_prefix.length), reg.sender_localpart, mxid)

	console.log("✅ Database is ready...")

	// ensure appservice bot user is registered...
	await api.register(reg.sender_localpart)

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
			return die(`Error: The bot needs to upload some emojis. Please say where to upload them to. Run setup again with --emoji-guild=GUILD_ID`)
		}
		// Upload those emojis to the chosen location
		db.prepare("REPLACE INTO auto_emoji (name, emoji_id, guild_id) VALUES ('_', '_', ?)").run(guild.id)
		await uploadAutoEmoji(discord.snow, guild, "L1", join(__dirname, "../docs/img/L1.png"))
		await uploadAutoEmoji(discord.snow, guild, "L2", join(__dirname, "../docs/img/L2.png"))
	}
	console.log("✅ Emojis are ready...")

	// set profile data on discord...
	const avatarImageBuffer = await fetch("https://cadence.moe/friends/out_of_your_element.png").then(res => res.arrayBuffer())
	await discord.snow.user.updateSelf({avatar: "data:image/png;base64," + Buffer.from(avatarImageBuffer).toString("base64")})
	await discord.snow.requestHandler.request(`/applications/@me`, {}, "patch", "json", {description: "Powered by **Out Of Your Element**\nhttps://gitdab.com/cadence/out-of-your-element"})
	console.log("✅ Discord profile updated...")

	// set profile data on homeserver...
	console.log("⏩ Updating Matrix profile... (If you've joined lots of rooms, this is slow. Please allow at least 30 seconds.)")
	await api.profileSetDisplayname(mxid, "Out Of Your Element")
	await api.profileSetAvatarUrl(mxid, avatarUrl)
	console.log("✅ Matrix profile updated...")

	console.log("Good to go. I hope you enjoy Out Of Your Element.")
	process.exit()
})()
