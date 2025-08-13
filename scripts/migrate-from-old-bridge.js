#!/usr/bin/env node
// @ts-check

const assert = require("assert").strict
const {Semaphore} = require("@chriscdn/promise-semaphore")
const sqlite = require("better-sqlite3")
const HeatSync = require("heatsync")

const passthrough = require("../src/passthrough")

const sync = new HeatSync({watchFS: false})

const {reg} = require("../src/matrix/read-registration")
assert(reg.old_bridge)
const oldAT = reg.old_bridge.as_token
const newAT = reg.as_token

const oldDB = new sqlite(reg.old_bridge.database)
const db = new sqlite("ooye.db")

db.exec(`CREATE TABLE IF NOT EXISTS half_shot_migration (
	discord_channel	TEXT NOT NULL,
	migrated	INTEGER NOT NULL,
	PRIMARY KEY("discord_channel")
) WITHOUT ROWID;`)

Object.assign(passthrough, {sync, db})

const DiscordClient = require("../src/d2m/discord-client")
const discord = new DiscordClient(reg.ooye.discord_token, "half")
passthrough.discord = discord

/** @type {import("../src/d2m/actions/create-space")} */
const createSpace = sync.require("../d2m/actions/create-space")
/** @type {import("../src/d2m/actions/create-room")} */
const createRoom = sync.require("../d2m/actions/create-room")
/** @type {import("../src/matrix/mreq")} */
const mreq = sync.require("../matrix/mreq")
/** @type {import("../src/matrix/api")} */
const api = sync.require("../matrix/api")

const sema = new Semaphore()

;(async () => {
	await discord.cloud.connect()
	console.log("Discord gateway started")

	discord.cloud.on("event", event => onPacket(discord, event))
})()

/** @param {DiscordClient} discord */
function onPacket(discord, event) {
	if (event.t === "GUILD_CREATE") {
		const guild = event.d
		if (!["112760669178241024"].includes(guild.id)) return
		sema.request(() => migrateGuild(guild))
	}
}

const newBridgeMxid = `@${reg.sender_localpart}:${reg.ooye.server_name}`

/** @param {import("discord-api-types/v10").GatewayGuildCreateDispatchData} guild */
async function migrateGuild(guild) {
	console.log(`START MIGRATION of ${guild.name} (${guild.id})`)

	// Step 1: Create a new space for the guild (createSpace)
	const spaceID = await createSpace.syncSpace(guild)

	let oldRooms = oldDB.prepare("SELECT matrix_id, discord_guild, discord_channel FROM room_entries INNER JOIN remote_room_data ON remote_id = room_id WHERE discord_guild = ?").all(guild.id)
	const migrated = db.prepare("SELECT discord_channel FROM half_shot_migration WHERE migrated = 1").pluck().all()
	oldRooms = oldRooms.filter(row => discord.channels.has(row.discord_channel) && !migrated.includes(row.discord_channel))
	console.log("Found these rooms which can be migrated:")
	console.log(oldRooms)

	for (const row of oldRooms) {
		const roomID = row.matrix_id
		const channel = discord.channels.get(row.discord_channel)
		assert(channel)

		// Step 2: (Using old bridge access token) Join the new bridge to the old rooms and give it PL 100
		console.log(`-- Joining channel ${channel.name}...`)
		await mreq.withAccessToken(oldAT, async () => {
			try {
				await api.inviteToRoom(roomID, newBridgeMxid)
			} catch (e) {
				if (e.message.includes("is already in the room")) {
					// Great!
				} else {
					throw e
				}
			}
			await api.setUserPower(roomID, newBridgeMxid, 100)
		})
		await api.joinRoom(roomID)

		// Step 3: Remove the old bridge's aliases
		console.log(`-- -- Deleting aliases...`)
		await mreq.withAccessToken(oldAT, async () => { // have to run as old application service since the AS owns its aliases
			const aliases = (await mreq.mreq("GET", `/client/v3/rooms/${roomID}/aliases`)).aliases
			for (const alias of aliases) {
				if (alias.match(/^#?_?discord/)) {
					await mreq.mreq("DELETE", `/client/v3/directory/room/${alias.replace(/#/g, "%23")}`)
				}
			}
			await api.sendState(roomID, "m.room.canonical_alias", "", {})
		})

		// Step 4: Add old rooms to new database; they are now also the new rooms
		// Make sure it wasn't already set up for the new bridge and bridged somewhere else pre-migration...
		const preMigrationRow = db.prepare("SELECT room_id, nick, custom_avatar FROM channel_room WHERE channel_id = ?").get(channel.id)
		if (preMigrationRow) {
			// Ok, so we're going to delete this row from the database and then add the new proper row.
			// But we want to copy over any previous custom settings like nick and avatar.
			// (By the way, thread_parent is always null here because thread rooms would never be migrated because they are not in the old bridge.)
			db.transaction(() => {
				db.prepare("DELETE FROM channel_room WHERE channel_id = ?").run(channel.id)
				db.prepare("INSERT INTO channel_room (channel_id, room_id, name, nick, custom_avatar, guild_id) VALUES (?, ?, ?, ?, ?, ?)").run(channel.id, row.matrix_id, channel.name, preMigrationRow.nick, preMigrationRow.custom_avatar, guild.id)
				console.log(`-- -- Added to database (transferred properties from previous OOYE room)`)
			})()
		} else {
			db.prepare("REPLACE INTO channel_room (channel_id, room_id, name) VALUES (?, ?, ?)").run(channel.id, row.matrix_id, channel.name)
			console.log(`-- -- Added to database`)
		}

		// Step 5: Call syncRoom for each room
		await createRoom.syncRoom(row.discord_channel)
		console.log(`-- -- Finished syncing`)

		db.prepare("INSERT INTO half_shot_migration (discord_channel, migrated) VALUES (?, 1)").run(channel.id)
	}

	// Step 5: Call syncSpace to make sure everything is up to date
	await createSpace.syncSpace(guild)
	console.log(`Finished migrating ${guild.name} to Out Of Your Element`)
}
