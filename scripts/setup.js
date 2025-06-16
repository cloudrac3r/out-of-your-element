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
const {magenta, bold, cyan} = require("ansi-colors")
const HeatSync = require("heatsync")
const {SnowTransfer} = require("snowtransfer")
const DiscordTypes = require("discord-api-types/v10")
const {createApp, defineEventHandler, toNodeListener} = require("h3")

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

const {setupEmojis} = require("../src/m2d/actions/setup-emojis")

function die(message) {
	console.error(message)
	process.exit(1)
}

async function suggestWellKnown(serverUrlPrompt, url, otherwise) {
	try {
		var json = await fetch(`${url}/.well-known/matrix/client`).then(res => res.json())
		let baseURL = json["m.homeserver"].base_url.replace(/\/$/, "")
		if (baseURL && baseURL !== url) {
			serverUrlPrompt.initial = baseURL
			return `Did you mean: ${bold(baseURL)}? (Enter to accept)`
		}
	} catch (e) {}
	return otherwise
}

async function validateHomeserverOrigin(serverUrlPrompt, url) {
	if (!url.match(/^https?:\/\//)) return "Must be a URL"
	if (url.match(/\/$/)) return "Must not end with a slash"
	process.stdout.write(magenta(" checking, please wait..."))
	try {
		var res = await fetch(`${url}/_matrix/client/versions`)
		if (res.status !== 200) {
			return suggestWellKnown(serverUrlPrompt, url, `There is no Matrix server at that URL (${url}/_matrix/client/versions returned ${res.status})`)
		}
	} catch (e) {
		return e.message
	}
	try {
		var json = await res.json()
		if (!Array.isArray(json?.versions) || !json.versions.includes("v1.11")) {
			return `OOYE needs Matrix version v1.11, but ${url} doesn't support this`
		}
	} catch (e) {
		return suggestWellKnown(serverUrlPrompt, url, `There is no Matrix server at that URL (${url}/_matrix/client/versions is not JSON)`)
	}
	return true
}

function defineEchoHandler() {
	return defineEventHandler(event => {
		return "Out Of Your Element is listening.\n" +
			`Received a ${event.method} request on path ${event.path}\n`
	})
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
		app.use(defineEchoHandler())
		const server = createServer(toNodeListener(app))
		await server.listen(6693)

		console.log("OOYE has its own web server. It needs to be accessible on the public internet.")
		console.log("You need to enter a public URL where you will be able to host this web server.")
		console.log("OOYE listens on localhost:6693, so you will probably have to set up a reverse proxy.")
		console.log("Examples: https://gitdab.com/cadence/out-of-your-element/src/branch/main/docs/get-started.md#appendix")
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
					if (!text.startsWith("Out Of Your Element is listening.")) return `Server does not point to OOYE`
					return true
				} catch (e) {
					return e.message
				}
			}
		})
		bridgeOriginResponse.bridge_origin = bridgeOriginResponse.bridge_origin.replace(/\/+$/, "") // remove trailing slash

		await server.close()

		console.log("What is your Discord bot token?")
		console.log("Go to https://discord.com/developers, create or pick an app, go to the Bot section, and reset the token.")
		/** @type {SnowTransfer} */ // @ts-ignore
		let snow = null
		/** @type {{id: string, flags: number, redirect_uris: string[], description: string}} */ // @ts-ignore
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
					client = await snow.requestHandler.request(`/applications/@me`, {}, "get", "json")
					return true
				} catch (e) {
					return e.message
				}
			}
		})

		const mandatoryIntentFlags = DiscordTypes.ApplicationFlags.GatewayMessageContent | DiscordTypes.ApplicationFlags.GatewayMessageContentLimited
		if (!(client.flags & mandatoryIntentFlags)) {
			console.log(`On that same page, scroll down to Privileged Gateway Intents and enable all switches.`)
			await prompt({
				type: "invisible",
				name: "intents",
				message: "Press Enter when you've enabled them",
				validate: async token => {
					process.stdout.write(magenta("checking, please wait..."))
					client = await snow.requestHandler.request(`/applications/@me`, {}, "get", "json")
					if (client.flags & mandatoryIntentFlags) {
						return true
					} else {
						return "Switches have not been enabled yet"
					}
				}
			})
		}

		console.log("Would you like to require a password to add your bot to servers? This will discourage others from using your bridge.")
		console.log("Important: To make it truly private, you MUST ALSO disable Public Bot in the Discord bot configuration page.")
		/** @type {{web_password: string}} */
		const passwordResponse = await prompt({
			type: "text",
			name: "web_password",
			message: "Choose a simple password (optional)"
		})

		console.log("To fulfill license obligations, I recommend mentioning Out Of Your Element in your Discord bot's profile.")
		console.log("On the Discord bot configuration page, go to General and add something like this to the description:")
		console.log(cyan("Powered by **Out Of Your Element**"))
		console.log(cyan("https://gitdab.com/cadence/out-of-your-element"))
		await prompt({
			type: "invisible",
			name: "description",
			message: "Press Enter to acknowledge",
			validate: async token => {
				process.stdout.write(magenta("checking, please wait..."))
				client = await snow.requestHandler.request(`/applications/@me`, {}, "get", "json")
				if (client.description?.match(/out.of.your.element/i)) {
					return true
				} else {
					return "Description must name or link Out Of Your Element"
				}
			}
		})

		console.log("What is your Discord client secret?")
		console.log(`You can find it in the application's OAuth2 section: https://discord.com/developers/applications/${client.id}/oauth2`)
		/** @type {{discord_client_secret: string}} */
		const clientSecretResponse = await prompt({
			type: "input",
			name: "discord_client_secret",
			message: "Client secret"
		})

		const expectedUri = `${bridgeOriginResponse.bridge_origin}/oauth`
		if (!client.redirect_uris.includes(expectedUri)) {
			console.log(`On that same page, scroll down to Redirects and add this URI: ${cyan(expectedUri)}`)
			await prompt({
				type: "invisible",
				name: "redirect_uri",
				message: "Press Enter when you've added it",
				validate: async token => {
					process.stdout.write(magenta("checking, please wait..."))
					client = await snow.requestHandler.request(`/applications/@me`, {}, "get", "json")
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
				...clientSecretResponse,
				...passwordResponse
			}
		}
		registration.reg = reg
		checkRegistration(reg)
		writeRegistration(reg)
		console.log(`✅ Your responses have been saved as ${registrationFilePath}`)
	} else {
		try {
			checkRegistration(reg)
			console.log(`✅ Skipped questions - reusing data from ${registrationFilePath}`)
		} catch (e) {
			console.log(`❌ Failed to reuse data from ${registrationFilePath}`)
			console.log("Consider deleting this file. You can re-run setup to safely make a new one.")
			console.log("")
			console.log(e.toString().replace(/^ *\n/gm, ""))
			process.exit(1)
		}
	}
	console.log(`  In ${cyan("Synapse")}, you need to reference that file in your homeserver.yaml and ${cyan("restart Synapse")}.`)
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
	as.router.use("/**", defineEchoHandler())

	console.log("⏳ Waiting for you to register the file with your homeserver... (Ctrl+C to cancel)")
	process.once("SIGINT", () => {
		console.log("(Ctrl+C) Quit early. Please re-run setup later and allow it to complete.")
		process.exit(1)
	})

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
	const client = await discord.snow.user.getSelf()
	db.prepare("INSERT INTO sim (user_id, username, sim_name, mxid) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING").run(client.id, client.username, reg.sender_localpart.slice(reg.ooye.namespace_prefix.length), mxid)

	console.log("✅ Database is ready...")

	// ensure appservice bot user is registered...
	await api.register(reg.sender_localpart)

	// upload initial images...
	const avatarUrl = await file.uploadDiscordFileToMxc("https://cadence.moe/friends/out_of_your_element.png")

	console.log("✅ Matrix appservice login works...")

	// upload the L1 L2 emojis to user emojis
	await setupEmojis()
	console.log("✅ Emojis are ready...")

	// set profile data on discord...
	const avatarImageBuffer = await fetch("https://cadence.moe/friends/out_of_your_element.png").then(res => res.arrayBuffer())
	await discord.snow.user.updateSelf({avatar: "data:image/png;base64," + Buffer.from(avatarImageBuffer).toString("base64")})
	console.log("✅ Discord profile updated...")

	// set profile data on homeserver...
	console.log("⏩ Updating Matrix profile... (If you've joined lots of rooms, this is slow. Please allow at least 30 seconds.)")
	await api.profileSetDisplayname(mxid, "Out Of Your Element")
	await api.profileSetAvatarUrl(mxid, avatarUrl)
	console.log("✅ Matrix profile updated...")

	console.log("Good to go. I hope you enjoy Out Of Your Element.")
	process.exit()
})()
