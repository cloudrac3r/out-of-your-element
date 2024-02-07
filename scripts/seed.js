// @ts-check

console.log("This could take up to 30 seconds. Please be patient.")

const assert = require("assert").strict
const fs = require("fs")
const sqlite = require("better-sqlite3")
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

const api = require("../matrix/api")
const file = require("../matrix/file")
const reg = require("../matrix/read-registration")
const utils = require("../m2d/converters/utils")

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

;(async () => {
	const mxid = `@${reg.sender_localpart}:${reg.ooye.server_name}`

	// ensure registration is correctly set...
	assert(reg.sender_localpart.startsWith(reg.ooye.namespace_prefix)) // appservice's localpart must be in the namespace it controls
	assert(utils.eventSenderIsFromDiscord(mxid)) // appservice's mxid must be in the namespace it controls
	assert(reg.ooye.server_origin.match(/^https?:\/\//)) // must start with http or https
	assert.notEqual(reg.ooye.server_origin.slice(-1), "/") // must not end in slash
	console.log("✅ Configuration looks good...")

	// database ddl...
	await migrate.migrate(db)

	// add initial rows to database, like adding the bot to sim...
	db.prepare("INSERT OR IGNORE INTO sim (user_id, sim_name, localpart, mxid) VALUES (?, ?, ?, ?)").run("0", reg.sender_localpart.slice(reg.ooye.namespace_prefix.length), reg.sender_localpart, mxid)

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
