// @ts-check

const assert = require("assert").strict
const DiscordTypes = require("discord-api-types/v10")

const passthrough = require("../../passthrough")
const { discord, sync, db } = passthrough
/** @type {import("../../matrix/mreq")} */
const mreq = sync.require("../../matrix/mreq")
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")

function kstateStripConditionals(kstate) {
	for (const [k, content] of Object.entries(kstate)) {
		if ("$if" in content) {
			if (content.$if) delete content.$if
			else delete kstate[k]
		}
	}
	return kstate
}

function kstateToState(kstate) {
	const events = []
	for (const [k, content] of Object.entries(kstate)) {
		// conditional for whether a key is even part of the kstate (doing this declaratively on json is hard, so represent it as a property instead.)
		if ("$if" in content && !content.$if) continue
		delete content.$if

		const [type, state_key] = k.split("/")
		assert.ok(typeof type === "string")
		assert.ok(typeof state_key === "string")
		events.push({type, state_key, content})
	}
	return events
}

/**
 * @param {import("../../types").Event.BaseStateEvent[]} events
 * @returns {any}
 */
function stateToKState(events) {
	const kstate = {}
	for (const event of events) {
		kstate[event.type + "/" + event.state_key] = event.content
	}
	return kstate
}

/**
 * @param {string} roomID
 */
async function roomToKState(roomID) {
	/** @type {import("../../types").Event.BaseStateEvent[]} */
	const root = await mreq.mreq("GET", `/client/v3/rooms/${roomID}/state`)
	return stateToKState(root)
}

/**
 * @params {string} roomID
 * @params {any} kstate
 */
function applyKStateDiffToRoom(roomID, kstate) {
	const events = kstateToState(kstate)
	return Promise.all(events.map(({type, state_key, content}) =>
		mreq.mreq("PUT", `/client/v3/rooms/${roomID}/state/${type}/${state_key}`, content)
	))
}

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
		// keys that are missing in "actual" will not be deleted on "target" (no action)
	}
	return diff
}

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

	const channelKState = {
		"m.room.name/": {name: channel.name},
		"m.room.topic/": {$if: channel.topic, topic: channel.topic},
		"m.room.avatar/": avatarEventContent,
		"m.room.guest_access/": {guest_access: "can_join"},
		"m.room.history_visibility/": {history_visibility: "invited"},
		[`m.space.parent/${spaceID}`]: {
			via: ["cadence.moe"], // TODO: put the proper server here
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

	return {spaceID, channelKState}
}

/**
 * @param {import("discord-api-types/v10").APIGuildTextChannel} channel
 * @param guild
 * @param {string} spaceID
 * @param {any} kstate
 */
async function createRoom(channel, guild, spaceID, kstate) {
	/** @type {import("../../types").R.RoomCreated} */
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
 * @param {import("discord-api-types/v10").APIGuildChannel} channel
 */
function channelToGuild(channel) {
	const guildID = channel.guild_id
	assert(guildID)
	const guild = discord.guilds.get(guildID)
	assert(guild)
	return guild
}

/**
 * @param {string} channelID
 */
async function syncRoom(channelID) {
	/** @ts-ignore @type {import("discord-api-types/v10").APIGuildChannel} */
	const channel = discord.channels.get(channelID)
	assert.ok(channel)
	const guild = channelToGuild(channel)

	const {spaceID, channelKState} = await channelToKState(channel, guild)

	/** @type {string?} */
	const existing = db.prepare("SELECT room_id from channel_room WHERE channel_id = ?").pluck().get(channel.id)
	if (!existing) {
		return createRoom(channel, guild, spaceID, channelKState)
	} else {
		// sync channel state to room
		const roomKState = await roomToKState(existing)
		const roomDiff = diffKState(roomKState, channelKState)
		const roomApply = applyKStateDiffToRoom(existing, roomDiff)

		// sync room as space member
		const spaceKState = await roomToKState(spaceID)
		const spaceDiff = diffKState(spaceKState, {
			[`m.space.child/${existing}`]: {
				via: ["cadence.moe"] // TODO: use the proper server
			}
		})
		const spaceApply = applyKStateDiffToRoom(spaceID, spaceDiff)
		return Promise.all([roomApply, spaceApply])
	}
}

async function createAllForGuild(guildID) {
	const channelIDs = discord.guildChannelMap.get(guildID)
	assert.ok(channelIDs)
	for (const channelID of channelIDs) {
		await syncRoom(channelID).then(r => console.log(`synced ${channelID}:`, r))
	}
}

module.exports.createRoom = createRoom
module.exports.syncRoom = syncRoom
module.exports.createAllForGuild = createAllForGuild
module.exports.kstateToState = kstateToState
module.exports.stateToKState = stateToKState
module.exports.diffKState = diffKState
module.exports.channelToKState = channelToKState
module.exports.kstateStripConditionals = kstateStripConditionals
