// @ts-check

const {z} = require("zod")
const {defineEventHandler, createError, readValidatedBody, setResponseHeader, H3Event} = require("h3")
const Ty = require("../../types")
const DiscordTypes = require("discord-api-types/v10")

const {discord, db, as, sync, select, from} = require("../../passthrough")
/** @type {import("../auth")} */
const auth = sync.require("../auth")
/** @type {import("../../matrix/mreq")} */
const mreq = sync.require("../../matrix/mreq")
const {reg} = require("../../matrix/read-registration")

/**
 * @param {H3Event} event
 * @returns {import("../../matrix/api")}
 */
function getAPI(event) {
	/* c8 ignore next */
	return event.context.api || sync.require("../../matrix/api")
}

/**
 * @param {H3Event} event
 * @returns {import("../../d2m/actions/create-room")}
 */
function getCreateRoom(event) {
	/* c8 ignore next */
	return event.context.createRoom || sync.require("../../d2m/actions/create-room")
}

/**
 * @param {H3Event} event
 * @returns {import("../../d2m/actions/create-space")}
 */
function getCreateSpace(event) {
	/* c8 ignore next */
	return event.context.createSpace || sync.require("../../d2m/actions/create-space")
}

const schema = {
	linkSpace: z.object({
		guild_id: z.string(),
		space_id: z.string()
	}),
	link: z.object({
		guild_id: z.string(),
		matrix: z.string(),
		discord: z.string()
	}),
	unlink: z.object({
		guild_id: z.string(),
		channel_id: z.string()
	})
}

as.router.post("/api/link-space", defineEventHandler(async event => {
	const parsedBody = await readValidatedBody(event, schema.linkSpace.parse)
	const session = await auth.useSession(event)
	const managed = await auth.getManagedGuilds(event)
	const api = getAPI(event)

	// Check guild ID
	const guildID = parsedBody.guild_id
	if (!managed.has(guildID)) throw createError({status: 403, message: "Forbidden", data: "Can't edit a guild you don't have Manage Server permissions in"})

	// Check space ID
	if (!session.data.mxid) throw createError({status: 403, message: "Forbidden", data: "Can't link with your Matrix space if you aren't logged in to Matrix"})
	const spaceID = parsedBody.space_id
	const inviteType = select("invite", "type", {mxid: session.data.mxid, room_id: spaceID}).pluck().get()
	if (inviteType !== "m.space") throw createError({status: 403, message: "Forbidden", data: "You personally must invite OOYE to that space on Matrix"})

	// Check they are not already bridged
	const existing = select("guild_space", "guild_id", {}, "WHERE guild_id = ? OR space_id = ?").get(guildID, spaceID)
	if (existing) throw createError({status: 400, message: "Bad Request", data: `Guild ID ${guildID} or space ID ${spaceID} are already bridged and cannot be reused`})

	const inviteSender = select("invite", "mxid", {mxid: session.data.mxid, room_id: spaceID}).pluck().get()
	const inviteSenderServer = inviteSender?.match(/:(.*)/)?.[1]
	const via = [inviteSenderServer || ""]

	// Check space exists and bridge is joined
	try {
		await api.joinRoom(parsedBody.space_id, null, via)
	} catch (e) {
		throw createError({status: 400, message: "Unable To Join", data: `Unable to join the requested Matrix space. Please invite the bridge to the space and try again. (Server said: ${e.errcode} - ${e.message})`})
	}

	// Check bridge has PL 100
	const me = `@${reg.sender_localpart}:${reg.ooye.server_name}`
	/** @type {Ty.Event.M_Power_Levels?} */
	let powerLevelsStateContent = null
	try {
		powerLevelsStateContent = await api.getStateEvent(spaceID, "m.room.power_levels", "")
	} catch (e) {}
	const selfPowerLevel = powerLevelsStateContent?.users?.[me] ?? powerLevelsStateContent?.users_default ?? 0
	if (selfPowerLevel < (powerLevelsStateContent?.state_default ?? 50) || selfPowerLevel < 100) throw createError({status: 400, message: "Bad Request", data: "OOYE needs power level 100 (admin) in the target Matrix space"})

	// Check inviting user is a moderator in the space
	const invitingPowerLevel = powerLevelsStateContent?.users?.[session.data.mxid] ?? powerLevelsStateContent?.users_default ?? 0
	if (invitingPowerLevel < (powerLevelsStateContent?.state_default ?? 50)) throw createError({status: 403, message: "Forbidden", data: `You need to be at least power level 50 (moderator) in the target Matrix space to set up OOYE, but you are currently power level ${invitingPowerLevel}.`})

	// Insert database entry
	db.transaction(() => {
		db.prepare("INSERT INTO guild_space (guild_id, space_id) VALUES (?, ?)").run(guildID, spaceID)
		db.prepare("DELETE FROM invite WHERE room_id = ?").run(spaceID)
	})()

	setResponseHeader(event, "HX-Refresh", "true")
	return null // 204
}))

as.router.post("/api/link", defineEventHandler(async event => {
	const parsedBody = await readValidatedBody(event, schema.link.parse)
	const managed = await auth.getManagedGuilds(event)
	const api = getAPI(event)
	const createRoom = getCreateRoom(event)
	const createSpace = getCreateSpace(event)

	// Check guild ID or nonce
	const guildID = parsedBody.guild_id
	if (!managed.has(guildID)) throw createError({status: 403, message: "Forbidden", data: "Can't edit a guild you don't have Manage Server permissions in"})

	// Check guild is bridged
	const guild = discord.guilds.get(guildID)
	if (!guild) throw createError({status: 400, message: "Bad Request", data: "Discord guild does not exist or bot has not joined it"})
	const spaceID = await createSpace.ensureSpace(guild)

	// Check channel exists
	const channel = discord.channels.get(parsedBody.discord)
	if (!channel) throw createError({status: 400, message: "Bad Request", data: "Discord channel does not exist"})

	// Check channel is part of the guild
	if (!("guild_id" in channel) || channel.guild_id !== guildID) throw createError({status: 400, message: "Bad Request", data: `Channel ID ${channel.id} is not part of guild ${guildID}`})

	// Check channel and room are not already bridged
	const row = from("channel_room").select("channel_id", "room_id").and("WHERE channel_id = ? OR room_id = ?").get(channel.id, parsedBody.matrix)
	if (row) throw createError({status: 400, message: "Bad Request", data: `Channel ID ${row.channel_id} or room ID ${parsedBody.matrix} are already bridged and cannot be reused`})

	// Check room is part of the guild's space
	let foundRoom = false
	/** @type {string[]?} */
	let foundVia = null
	for await (const room of api.generateFullHierarchy(spaceID)) {
		// When finding a space during iteration, look at space's children state, because we need a `via` to join the room (when we find it later)
		for (const state of room.children_state) {
			if (state.type === "m.space.child" && state.state_key === parsedBody.matrix) {
				foundVia = state.content.via
			}
		}

		// When finding a room during iteration, see if it was the requested room (to confirm that the room is in the space)
		if (room.room_id === parsedBody.matrix && !room.room_type) {
			foundRoom = true
		}

		if (foundRoom && foundVia) break
	}
	if (!foundRoom) throw createError({status: 400, message: "Bad Request", data: "Matrix room needs to be part of the bridged space"})

	// Check room exists and bridge is joined
	try {
		await api.joinRoom(parsedBody.matrix, null, foundVia)
	} catch (e) {
		if (!foundVia) {
			throw createError({status: 400, message: "Unable To Join", data: `Unable to join the requested Matrix room. Please invite the bridge to the room and try again. (Server said: ${e.errcode} - ${e.message})`})
		}
		throw createError({status: 403, message: e.errcode, data: `${e.errcode} - ${e.message}`})
	}

	// Check bridge has PL 100
	const me = `@${reg.sender_localpart}:${reg.ooye.server_name}`
	/** @type {Ty.Event.M_Power_Levels?} */
	let powerLevelsStateContent = null
	try {
		powerLevelsStateContent = await api.getStateEvent(parsedBody.matrix, "m.room.power_levels", "")
	} catch (e) {}
	const selfPowerLevel = powerLevelsStateContent?.users?.[me] ?? powerLevelsStateContent?.users_default ?? 0
	if (selfPowerLevel < (powerLevelsStateContent?.state_default ?? 50) || selfPowerLevel < 100) throw createError({status: 400, message: "Bad Request", data: "OOYE needs power level 100 (admin) in the target Matrix room"})

	// Insert database entry, but keep the room's existing properties if they are set
	const nick = await api.getStateEvent(parsedBody.matrix, "m.room.name", "").then(content => content.name || null).catch(() => null)
	const avatar = await api.getStateEvent(parsedBody.matrix, "m.room.avatar", "").then(content => content.url || null).catch(() => null)
	const topic = await api.getStateEvent(parsedBody.matrix, "m.room.topic", "").then(content => content.topic || null).catch(() => null)
	db.prepare("INSERT INTO channel_room (channel_id, room_id, name, guild_id, nick, custom_avatar, custom_topic) VALUES (?, ?, ?, ?, ?, ?, ?)").run(channel.id, parsedBody.matrix, channel.name, guildID, nick, avatar, topic)

	// Sync room data and space child
	await createRoom.syncRoom(parsedBody.discord)

	// Send a notification in the room
	if (channel.type === DiscordTypes.ChannelType.GuildText) {
		await api.sendEvent(parsedBody.matrix, "m.room.message", {
			msgtype: "m.notice",
			body: "👋 This room is now bridged with Discord. Say hi!"
		})
	}

	setResponseHeader(event, "HX-Refresh", "true")
	return null // 204
}))

as.router.post("/api/unlink", defineEventHandler(async event => {
	const {channel_id, guild_id} = await readValidatedBody(event, schema.unlink.parse)
	const managed = await auth.getManagedGuilds(event)
	const createRoom = getCreateRoom(event)

	// Check guild ID or nonce
	if (!managed.has(guild_id)) throw createError({status: 403, message: "Forbidden", data: "Can't edit a guild you don't have Manage Server permissions in"})

	// Check guild exists
	const guild = discord.guilds.get(guild_id)
	if (!guild) throw createError({status: 400, message: "Bad Request", data: "Discord guild does not exist or bot has not joined it"})

	// Check that the channel (if it exists) is part of this guild
	/** @type {any} */
	let channel = discord.channels.get(channel_id)
	if (channel) {
		if (!("guild_id" in channel) || channel.guild_id !== guild_id) throw createError({status: 400, message: "Bad Request", data: `Channel ID ${channel_id} is not part of guild ${guild_id}`})
	} else {
		// Otherwise, if the channel isn't cached, it must have been deleted.
		// There's no other authentication here - it's okay for anyone to unlink a deleted channel just by knowing its ID.
		channel = {id: channel_id}
	}

	// Check channel is currently bridged
	const row = select("channel_room", "channel_id", {channel_id: channel_id}).get()
	if (!row) throw createError({status: 400, message: "Bad Request", data: `Channel ID ${channel_id} is not currently bridged`})

	// Do it
	await createRoom.unbridgeDeletedChannel(channel, guild_id)

	setResponseHeader(event, "HX-Refresh", "true")
	return null // 204
}))
