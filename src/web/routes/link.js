// @ts-check

const {z} = require("zod")
const {defineEventHandler, useSession, createError, readValidatedBody, setResponseHeader} = require("h3")
const Ty = require("../../types")

const {discord, db, as, sync, select, from} = require("../../passthrough")
/** @type {import("../../d2m/actions/create-space")} */
const createSpace = sync.require("../../d2m/actions/create-space")
/** @type {import("../../d2m/actions/create-room")} */
const createRoom = sync.require("../../d2m/actions/create-room")
const {reg} = require("../../matrix/read-registration")

/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")

const schema = {
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

as.router.post("/api/link", defineEventHandler(async event => {
	const parsedBody = await readValidatedBody(event, schema.link.parse)
	const session = await useSession(event, {password: reg.as_token})

	// Check guild ID or nonce
	const guildID = parsedBody.guild_id
	if (!(session.data.managedGuilds || []).includes(guildID)) throw createError({status: 403, message: "Forbidden", data: "Can't edit a guild you don't have Manage Server permissions in"})

	// Check guild is bridged
	const guild = discord.guilds.get(guildID)
	if (!guild) throw createError({status: 400, message: "Bad Request", data: "Discord guild does not exist or bot has not joined it"})
	const spaceID = await createSpace.ensureSpace(guild)

	// Check channel exists
	const channel = discord.channels.get(parsedBody.discord)
	if (!channel) throw createError({status: 400, message: "Bad Request", data: "Discord channel does not exist"})

	// Check channel and room are not already bridged
	const row = from("channel_room").select("channel_id", "room_id").and("WHERE channel_id = ? OR room_id = ?").get(parsedBody.discord, parsedBody.matrix)
	if (row) throw createError({status: 400, message: "Bad Request", data: `Channel ID ${row.channel_id} and room ID ${row.room_id} are already bridged and cannot be reused`})

	// Check room exists and bridge is joined and bridge has PL 100
	const self = `@${reg.sender_localpart}:${reg.ooye.server_name}`
	/** @type {Ty.Event.M_Room_Member} */
	const memberEvent = await api.getStateEvent(parsedBody.matrix, "m.room.member", self)
	if (memberEvent.membership !== "join") throw createError({status: 400, message: "Bad Request", data: "Matrix room does not exist"})
	/** @type {Ty.Event.M_Power_Levels} */
	const powerLevelsStateContent = await api.getStateEvent(parsedBody.matrix, "m.room.power_levels", "")
	const selfPowerLevel = powerLevelsStateContent.users?.[self] || powerLevelsStateContent.users_default || 0
	if (selfPowerLevel < (powerLevelsStateContent.state_default || 50) || selfPowerLevel < 100) throw createError({status: 400, message: "Bad Request", data: "OOYE needs power level 100 (admin) in the target Matrix room"})

	// Insert database entry
	db.prepare("INSERT INTO channel_room (channel_id, room_id, name, guild_id) VALUES (?, ?, ?, ?)").run(parsedBody.discord, parsedBody.matrix, channel.name, guildID)

	// Sync room data and space child
	await createRoom.syncRoom(parsedBody.discord)

	return null // 204
}))

as.router.post("/api/unlink", defineEventHandler(async event => {
	const {channel_id, guild_id} = await readValidatedBody(event, schema.unlink.parse)
	const session = await useSession(event, {password: reg.as_token})

	// Check guild ID or nonce
	if (!(session.data.managedGuilds || []).includes(guild_id)) throw createError({status: 403, message: "Forbidden", data: "Can't edit a guild you don't have Manage Server permissions in"})

	// Check channel is part of this guild
	const channel = discord.channels.get(channel_id)
	if (!channel) throw createError({status: 400, message: "Bad Request", data: `Channel ID ${channel_id} does not exist`})
	if (!("guild_id" in channel) || channel.guild_id !== guild_id) throw createError({status: 400, message: "Bad Request", data: `Channel ID ${channel_id} is not part of guild ${guild_id}`})

	// Check channel is currently bridged
	const row = select("channel_room", "channel_id", {channel_id: channel_id}).get()
	if (!row) throw createError({status: 400, message: "Bad Request", data: `Channel ID ${channel_id} is not currently bridged`})

	// Do it
	await createRoom.unbridgeDeletedChannel(channel, guild_id)

	setResponseHeader(event, "HX-Refresh", "true")
	return null // 204
}))
