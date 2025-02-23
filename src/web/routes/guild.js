// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const assert = require("assert/strict")
const {z} = require("zod")
const {H3Event, defineEventHandler, sendRedirect, createError, getValidatedQuery, readValidatedBody, setResponseHeader} = require("h3")
const {randomUUID} = require("crypto")
const {LRUCache} = require("lru-cache")
const Ty = require("../../types")
const uqr = require("uqr")

const {id: botID} = require("../../../addbot")
const {discord, as, sync, select, from, db} = require("../../passthrough")
/** @type {import("../pug-sync")} */
const pugSync = sync.require("../pug-sync")
/** @type {import("../../d2m/actions/create-space")} */
const createSpace = sync.require("../../d2m/actions/create-space")
/** @type {import("../auth")} */
const auth = require("../auth")
/** @type {import("../../discord/utils")} */
const utils = sync.require("../../discord/utils")
const {reg} = require("../../matrix/read-registration")

const schema = {
	guild: z.object({
		guild_id: z.string().optional()
	}),
	qr: z.object({
		guild_id: z.string().optional()
	}),
	invite: z.object({
		mxid: z.string().regex(/@([^:]+):([a-z0-9:-]+\.[a-z0-9.:-]+)/),
		permissions: z.enum(["default", "moderator", "admin"]),
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
 * Modifies the input, removing items that don't pass the filter. Returns the items that didn't pass.
 * @param {T[]} xs
 * @param {(x: T, i?: number) => any} fn
 * @template T
 * @returns T[]
 */
function filterTo(xs, fn) {
	/** @type {T[]} */
	const filtered = []
	for (let i = xs.length-1; i >= 0; i--) {
		const x = xs[i]
		if (!fn(x, i)) {
			filtered.unshift(x)
			xs.splice(i, 1)
		}
	}
	return filtered
}

/**
 * @param {DiscordTypes.APIGuild} guild
 * @param {Ty.R.Hierarchy[]} rooms
 * @param {string[]} roles
 */
function getChannelRoomsLinks(guild, rooms, roles) {
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

	let channelIDs = discord.guildChannelMap.get(guild.id)
	assert(channelIDs)

	let linkedChannels = select("channel_room", ["channel_id", "room_id", "name", "nick"], {channel_id: channelIDs}).all()
	let linkedChannelsWithDetails = linkedChannels.map(c => ({channel: discord.channels.get(c.channel_id), ...c}))
	let removedUncachedChannels = filterTo(linkedChannelsWithDetails, c => c.channel)
	let linkedChannelIDs = linkedChannelsWithDetails.map(c => c.channel_id)
	linkedChannelsWithDetails.sort((a, b) => getPosition(a.channel) - getPosition(b.channel))

	let unlinkedChannelIDs = channelIDs.filter(c => !linkedChannelIDs.includes(c))
	/** @type {DiscordTypes.APIGuildChannel[]} */ // @ts-ignore
	let unlinkedChannels = unlinkedChannelIDs.map(c => discord.channels.get(c))
	let removedWrongTypeChannels = filterTo(unlinkedChannels, c => c && [0, 5].includes(c.type))
	let removedPrivateChannels = filterTo(unlinkedChannels, c => {
		const permissions = utils.getPermissions(roles, guild.roles, botID, c["permission_overwrites"])
		return utils.hasPermission(permissions, DiscordTypes.PermissionFlagsBits.ViewChannel)
	})
	unlinkedChannels.sort((a, b) => getPosition(a) - getPosition(b))

	let linkedRoomIDs = linkedChannels.map(c => c.room_id)
	let unlinkedRooms = [...rooms]
	let removedLinkedRooms = filterTo(unlinkedRooms, r => !linkedRoomIDs.includes(r.room_id))
	let removedWrongTypeRooms = filterTo(unlinkedRooms, r => !r.room_type)
	// https://discord.com/developers/docs/topics/threads#active-archived-threads
	// need to filter out linked archived threads from unlinkedRooms, will just do that by comparing against the name
	let removedArchivedThreadRooms = filterTo(unlinkedRooms, r => r.name && !r.name.match(/^\[(🔒)?⛓️\]/))

	return {
		linkedChannelsWithDetails, unlinkedChannels, unlinkedRooms,
		removedUncachedChannels, removedWrongTypeChannels, removedPrivateChannels, removedLinkedRooms, removedWrongTypeRooms, removedArchivedThreadRooms
	}
}

as.router.get("/guild", defineEventHandler(async event => {
	const {guild_id} = await getValidatedQuery(event, schema.guild.parse)
	const session = await auth.useSession(event)
	const managed = await auth.getManagedGuilds(event)
	const row = from("guild_active").join("guild_space", "guild_id", "left").select("space_id", "privacy_level", "autocreate").where({guild_id}).get()
	// @ts-ignore
	const guild = discord.guilds.get(guild_id)

	// Permission problems
	if (!guild_id || !guild || !managed.has(guild_id) || !row) {
		return pugSync.render(event, "guild_access_denied.pug", {guild_id, row})
	}

	// Self-service guild that hasn't been linked yet - needs a special page encouraging the link flow
	if (!row.space_id && row.autocreate === 0) {
		const spaces = db.prepare("SELECT room_id, type, name, topic, avatar FROM invite LEFT JOIN guild_space ON invite.room_id = guild_space.space_id WHERE mxid = ? AND space_id IS NULL AND type = 'm.space'").all(session.data.mxid)
		return pugSync.render(event, "guild_not_linked.pug", {guild, guild_id, spaces})
	}

	const roles = guild.members?.find(m => m.user.id === botID)?.roles || []

	// Easy mode guild that hasn't been linked yet - need to remove elements that would require an existing space
	if (!row.space_id) {
		const links = getChannelRoomsLinks(guild, [], roles)
		return pugSync.render(event, "guild.pug", {guild, guild_id, ...links, ...row})
	}

	// Linked guild
	const api = getAPI(event)
	const rooms = await api.getFullHierarchy(row.space_id)
	const links = getChannelRoomsLinks(guild, rooms, roles)
	return pugSync.render(event, "guild.pug", {guild, guild_id, ...links, ...row})
}))

as.router.get("/qr", defineEventHandler(async event => {
	const {guild_id} = await getValidatedQuery(event, schema.qr.parse)
	const managed = await auth.getManagedGuilds(event)
	const row = from("guild_active").join("guild_space", "guild_id", "left").select("space_id", "privacy_level", "autocreate").where({guild_id}).get()
	// @ts-ignore
	const guild = discord.guilds.get(guild_id)

	// Permission problems
	if (!guild_id || !guild || !managed.has(guild_id) || !row) {
		return pugSync.render(event, "guild_access_denied.pug", {guild_id, row})
	}

	const nonce = randomUUID()
	validNonce.set(nonce, guild_id)

	const data = `${reg.ooye.bridge_origin}/invite?nonce=${nonce}`
	// necessary to scale the svg pixel-perfectly on the page
	// https://github.com/unjs/uqr/blob/244952a8ba2d417f938071b61e11fb1ff95d6e75/src/svg.ts#L24
	const generatedSvg = uqr.renderSVG(data, {pixelSize: 3})
	const svg = generatedSvg.replace(/viewBox="0 0 ([0-9]+) ([0-9]+)"/, `data-nonce="${nonce}" width="$1" height="$2" $&`)
	assert.notEqual(svg, generatedSvg)

	return svg
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
	const managed = await auth.getManagedGuilds(event)
	const api = getAPI(event)

	// Check guild ID or nonce
	if (parsedBody.guild_id) {
		var guild_id = parsedBody.guild_id
		if (!managed.has(guild_id)) throw createError({status: 403, message: "Forbidden", data: "Can't invite users to a guild you don't have Manage Server permissions in"})
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
	const powerLevel =
		( parsedBody.permissions === "admin" ? 100
		: parsedBody.permissions === "moderator" ? 50
		: 0)
	if (powerLevel) await api.setUserPowerCascade(spaceID, parsedBody.mxid, powerLevel)

	if (parsedBody.guild_id) {
		setResponseHeader(event, "HX-Refresh", true)
		return sendRedirect(event, `/guild?guild_id=${guild_id}`, 302)
	} else {
		return sendRedirect(event, "/ok?msg=User has been invited.", 302)
	}
}))
