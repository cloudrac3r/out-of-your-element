// @ts-check

const assert = require("assert/strict")
const {z} = require("zod")
const {H3Event, defineEventHandler, sendRedirect, useSession, createError, getValidatedQuery, readValidatedBody} = require("h3")
const {randomUUID} = require("crypto")
const {LRUCache} = require("lru-cache")
const Ty = require("../../types")

const {discord, as, sync, select} = require("../../passthrough")
/** @type {import("../pug-sync")} */
const pugSync = sync.require("../pug-sync")
/** @type {import("../../d2m/actions/create-space")} */
const createSpace = sync.require("../../d2m/actions/create-space")
const {reg} = require("../../matrix/read-registration")

const schema = {
	guild: z.object({
		guild_id: z.string().optional()
	}),
	invite: z.object({
		mxid: z.string().regex(/@([^:]+):([a-z0-9:-]+\.[a-z0-9.:-]+)/),
		permissions: z.enum(["default", "moderator"]),
		guild_id: z.string().optional(),
		nonce: z.string().optional()
	}),
	inviteNonce: z.object({
		nonce: z.string()
	})
}

/**
 * @param {H3Event} event
 * @returns {import("../../matrix/api")}
 */
function getAPI(event) {
	/* c8 ignore next */
	return event.context.api || sync.require("../../matrix/api")
}

/** @type {LRUCache<string, string>} nonce to guild id */
const validNonce = new LRUCache({max: 200})

/**
 * @param {string} guildID
 * @param {Ty.R.Hierarchy[]} rooms
 */
function getChannelRoomsLinks(guildID, rooms) {
	function getPosition(channel) {
		let position = 0
		let looking = channel
		while (looking.parent_id) {
			looking = discord.channels.get(looking.parent_id)
			position = looking.position * 1000
		}
		if (channel.position) position += channel.position
		return position
	}

	let channelIDs = discord.guildChannelMap.get(guildID)
	assert(channelIDs)

	let linkedChannels = select("channel_room", ["channel_id", "room_id", "name", "nick"], {channel_id: channelIDs}).all()
	let linkedChannelsWithDetails = linkedChannels.map(c => ({channel: discord.channels.get(c.channel_id), ...c})).filter(c => c.channel)
	let linkedChannelIDs = linkedChannelsWithDetails.map(c => c.channel_id)
	linkedChannelsWithDetails.sort((a, b) => getPosition(a.channel) - getPosition(b.channel))

	let unlinkedChannelIDs = channelIDs.filter(c => !linkedChannelIDs.includes(c))
	let unlinkedChannels = unlinkedChannelIDs.map(c => discord.channels.get(c)).filter(c => c && [0, 5].includes(c.type))
	unlinkedChannels.sort((a, b) => getPosition(a) - getPosition(b))

	let linkedRoomIDs = linkedChannels.map(c => c.room_id)
	let unlinkedRooms = rooms.filter(r => !linkedRoomIDs.includes(r.room_id) && !r.room_type)
	// https://discord.com/developers/docs/topics/threads#active-archived-threads
	// need to filter out linked archived threads from unlinkedRooms, will just do that by comparing against the name
	unlinkedRooms = unlinkedRooms.filter(r => r.name && !r.name.match(/^\[(🔒)?⛓️\]/))

	return {linkedChannelsWithDetails, unlinkedChannels, unlinkedRooms}
}

as.router.get("/guild", defineEventHandler(async event => {
	const {guild_id} = await getValidatedQuery(event, schema.guild.parse)
	const session = await useSession(event, {password: reg.as_token})
	const row = select("guild_space", ["space_id", "privacy_level"], {guild_id}).get()
	// @ts-ignore
	const guild = discord.guilds.get(guild_id)

	// Permission problems
	if (!guild_id || !guild || !session.data.managedGuilds || !session.data.managedGuilds.includes(guild_id)) {
		return pugSync.render(event, "guild_access_denied.pug", {guild_id})
	}

	const nonce = randomUUID()
	validNonce.set(nonce, guild_id)

	// Unlinked guild
	if (!row) {
		const links = getChannelRoomsLinks(guild_id, [])
		return pugSync.render(event, "guild.pug", {guild_id, nonce, ...links})
	}

	// Linked guild
	const api = getAPI(event)
	const mods = await api.getStateEvent(row.space_id, "m.room.power_levels", "")
	const banned = await api.getMembers(row.space_id, "ban")
	const rooms = await api.getFullHierarchy(row.space_id)
	const links = getChannelRoomsLinks(guild_id, rooms)
	return pugSync.render(event, "guild.pug", {guild, guild_id, nonce, mods, banned, ...links, ...row})
}))

as.router.get("/invite", defineEventHandler(async event => {
	const {nonce} = await getValidatedQuery(event, schema.inviteNonce.parse)
	const isValid = validNonce.has(nonce)
	const guild_id = validNonce.get(nonce)
	const guild = discord.guilds.get(guild_id || "")
	return pugSync.render(event, "invite.pug", {isValid, nonce, guild_id, guild})
}))

as.router.post("/api/invite", defineEventHandler(async event => {
	const parsedBody = await readValidatedBody(event, schema.invite.parse)
	const session = await useSession(event, {password: reg.as_token})
	const api = getAPI(event)

	// Check guild ID or nonce
	if (parsedBody.guild_id) {
		var guild_id = parsedBody.guild_id
		if (!(session.data.managedGuilds || []).includes(guild_id)) throw createError({status: 403, message: "Forbidden", data: "Can't invite users to a guild you don't have Manage Server permissions in"})
	} else if (parsedBody.nonce) {
		if (!validNonce.has(parsedBody.nonce)) throw createError({status: 403, message: "Nonce expired", data: "Nonce means number-used-once, and, well, you tried to use it twice..."})
		let ok = validNonce.get(parsedBody.nonce)
		assert(ok)
		var guild_id = ok
		validNonce.delete(parsedBody.nonce)
	} else {
		throw createError({status: 400, message: "Missing guild ID", data: "Passing a guild ID or a nonce is required."})
	}

	// Check guild is bridged
	const guild = discord.guilds.get(guild_id)
	assert(guild)
	const spaceID = await createSpace.ensureSpace(guild)

	// Check for existing invite to the space
	let spaceMember
	try {
		spaceMember = await api.getStateEvent(spaceID, "m.room.member", parsedBody.mxid)
	} catch (e) {}

	if (!spaceMember || !["invite", "join"].includes(spaceMember.membership)) {
		// Invite
		await api.inviteToRoom(spaceID, parsedBody.mxid)
	}

	// Permissions
	const powerLevel = parsedBody.permissions === "moderator" ? 50 : 0
	await api.setUserPowerCascade(spaceID, parsedBody.mxid, powerLevel)

	if (parsedBody.guild_id) {
		return sendRedirect(event, `/guild?guild_id=${guild_id}`, 302)
	} else {
		return sendRedirect(event, "/ok?msg=User has been invited.", 302)
	}
}))
