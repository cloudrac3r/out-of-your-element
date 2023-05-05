// @ts-check

const assert = require("assert").strict
const {test} = require("supertape")
const testData = require("../../test/data")
const DiscordTypes = require("discord-api-types/v10")

const passthrough = require("../../passthrough")
const { discord, sync, db } = passthrough
/** @type {import("../../matrix/mreq")} */
const mreq = sync.require("../../matrix/mreq")
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")

function kstateToState(kstate) {
	return Object.entries(kstate).map(([k, content]) => {
		console.log(k)
		const [type, state_key] = k.split("/")
		assert.ok(typeof type === "string")
		assert.ok(typeof state_key === "string")
		return {type, state_key, content}
	})
}

test("kstate2state: general", t => {
	t.deepEqual(kstateToState({
		"m.room.name/": {name: "test name"},
		"m.room.member/@cadence:cadence.moe": {membership: "join"}
	}), [
		{
			type: "m.room.name",
			state_key: "",
			content: {
				name: "test name"
			}
		},
		{
			type: "m.room.member",
			state_key: "@cadence:cadence.moe",
			content: {
				membership: "join"
			}
		}
	])
})

function diffKState(actual, target) {
	const diff = {}
	// go through each key that it should have
	for (const key of Object.keys(target)) {
		if (key in actual) {
			// diff
			try {
				assert.deepEqual(actual[key], target[key])
			} catch (e) {
				// they differ. reassign the target
				diff[key] = target[key]
			}
		} else {
			// not present, needs to be added
			diff[key] = target[key]
		}
	}
	return diff
}

test("diffKState: detects edits", t => {
	t.deepEqual(
		diffKState({
			"m.room.name/": {name: "test name"},
			"same/": {a: 2}
		}, {
			"m.room.name/": {name: "edited name"},
			"same/": {a: 2}
		}),
		{
			"m.room.name/": {name: "edited name"}
		}
	)
})

test("diffKState: detects new properties", t => {
	t.deepEqual(
		diffKState({
			"m.room.name/": {name: "test name"},
		}, {
			"m.room.name/": {name: "test name"},
			"new/": {a: 2}
		}),
		{
			"new/": {a: 2}
		}
	)
})

/**
 * @param {import("discord-api-types/v10").APIGuildTextChannel} channel
 * @param {import("discord-api-types/v10").APIGuild} guild
 */
async function channelToKState(channel, guild) {
	const spaceID = db.prepare("SELECT space_id FROM guild_space WHERE guild_id = ?").pluck().get(guild.id)
	assert.ok(typeof spaceID === "string")

	const avatarEventContent = {}
	if (guild.icon) {
		avatarEventContent.discord_path = file.guildIcon(guild)
		avatarEventContent.url = await file.uploadDiscordFileToMxc(avatarEventContent.discord_path)
	}

	const kstate = {
		"m.room.name/": {name: channel.name},
		"m.room.topic/": {topic: channel.topic || undefined},
		"m.room.avatar/": avatarEventContent,
		"m.room.guest_access/": {guest_access: "can_join"},
		"m.room.history_visibility/": {history_visibility: "invited"},
		[`m.space.parent/${spaceID}`]: { // TODO: put the proper server here
			via: ["cadence.moe"],
			canonical: true
		},
		"m.room.join_rules/": {
			join_rule: "restricted",
			allow: [{
				type: "m.room.membership",
				room_id: spaceID
			}]
		}
	}

	return {spaceID, kstate}
}

test("channel2room: general", async t => {
	t.deepEqual(await channelToKState(testData.channel.general, testData.guild.general).then(x => x.kstate), {expected: true, ...testData.room.general})
})

/**
 * @param {import("discord-api-types/v10").APIGuildTextChannel} channel
 * @param guild
 * @param {string} spaceID
 * @param {any} kstate
 */
async function createRoom(channel, guild, spaceID, kstate) {
	/** @type {import("../../types").R_RoomCreated} */
	const root = await mreq.mreq("POST", "/client/v3/createRoom", {
		name: channel.name,
		topic: channel.topic || undefined,
		preset: "private_chat",
		visibility: "private",
		invite: ["@cadence:cadence.moe"], // TODO
		initial_state: kstateToState(kstate)
	})

	db.prepare("INSERT INTO channel_room (channel_id, room_id) VALUES (?, ?)").run(channel.id, root.room_id)

	// Put the newly created child into the space
	await mreq.mreq("PUT", `/client/v3/rooms/${spaceID}/state/m.space.child/${root.room_id}`, {
		via: ["cadence.moe"] // TODO: use the proper server
	})
}

/**
 * @param {import("discord-api-types/v10").APIGuildTextChannel} channel
 */
async function syncRoom(channel) {
	const guildID = channel.guild_id
	assert(guildID)
	const guild = discord.guilds.get(guildID)
	assert(guild)

	const {spaceID, kstate} = await channelToKState(channel, guild)

	/** @type {string?} */
	const existing = db.prepare("SELECT room_id from channel_room WHERE channel_id = ?").pluck().get(channel.id)
	if (!existing) {
		createRoom(channel, guild, spaceID, kstate)
	}
}

async function createAllForGuild(guildID) {
	const channelIDs = discord.guildChannelMap.get(guildID)
	assert.ok(channelIDs)
	for (const channelID of channelIDs) {
		const channel = discord.channels.get(channelID)
		assert.ok(channel)
		const existing = db.prepare("SELECT room_id FROM channel_room WHERE channel_id = ?").pluck().get(channel.id)
		if (channel.type === DiscordTypes.ChannelType.GuildText && !existing) {
			await createRoom(channel)
		}
	}
}

module.exports.createRoom = createRoom
module.exports.createAllForGuild = createAllForGuild
