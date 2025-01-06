// @ts-check

const {z} = require("zod")
const {randomUUID} = require("crypto")
const {defineEventHandler, getValidatedQuery, sendRedirect, getQuery, useSession, createError} = require("h3")
const {SnowTransfer} = require("snowtransfer")
const DiscordTypes = require("discord-api-types/v10")
const fetch = require("node-fetch")
const getRelativePath = require("get-relative-path")

const {as, db} = require("../../passthrough")
const {id} = require("../../../addbot")
const {reg} = require("../../matrix/read-registration")

const redirect_uri = `${reg.ooye.bridge_origin}/oauth`

const schema = {
	first: z.object({
		action: z.string().optional()
	}),
	code: z.object({
		state: z.string(),
		code: z.string(),
		guild_id: z.string().optional()
	}),
	token: z.object({
		token_type: z.string(),
		access_token: z.string(),
		expires_in: z.number({coerce: true}),
		refresh_token: z.string(),
		scope: z.string()
	})
}

as.router.get("/oauth", defineEventHandler(async event => {
	const session = await useSession(event, {password: reg.as_token})
	let scope = "guilds"

	const parsedFirstQuery = await getValidatedQuery(event, schema.first.safeParse)
	if (parsedFirstQuery.data?.action === "add") {
		scope = "bot+guilds"
		await session.update({selfService: false})
	} else if (parsedFirstQuery.data?.action === "add-self-service") {
		scope = "bot+guilds"
		await session.update({selfService: true})
	}

	async function tryAgain() {
		const newState = randomUUID()
		await session.update({state: newState})
		return sendRedirect(event, `https://discord.com/oauth2/authorize?client_id=${id}&scope=${scope}&permissions=1610883072&response_type=code&redirect_uri=${redirect_uri}&state=${newState}`)
	}

	const parsedQuery = await getValidatedQuery(event, schema.code.safeParse)
	if (!parsedQuery.success) return tryAgain()

	const savedState = session.data.state
	if (!savedState) throw createError({status: 400, message: "Missing state", data: "Missing saved state parameter. Please try again, and make sure you have cookies enabled."})
	if (savedState != parsedQuery.data.state) return tryAgain()

	const res = await fetch("https://discord.com/api/oauth2/token", {
		method: "post",
		body: new URLSearchParams({
			grant_type: "authorization_code",
			client_id: id,
			client_secret: reg.ooye.discord_client_secret,
			redirect_uri,
			code: parsedQuery.data.code
		})
	})
	const root = await res.json()

	const parsedToken = schema.token.safeParse(root)
	if (!res.ok || !parsedToken.success) {
		throw createError({status: 502, message: "Invalid token response", data: `Discord completed OAuth, but returned this instead of an OAuth access token: ${JSON.stringify(root)}`})
	}

	const client = new SnowTransfer(`Bearer ${parsedToken.data.access_token}`)
	try {
		const guilds = await client.user.getGuilds()
		var managedGuilds = guilds.filter(g => BigInt(g.permissions) & DiscordTypes.PermissionFlagsBits.ManageGuild).map(g => g.id)
		await session.update({managedGuilds})
	} catch (e) {
		throw createError({status: 502, message: "API call failed", data: e.message})
	}

	// Set auto-create for the guild
	// @ts-ignore
	if (managedGuilds.includes(parsedQuery.data.guild_id)) {
		db.prepare("REPLACE INTO guild_active (guild_id, autocreate) VALUES (?, ?)").run(parsedQuery.data.guild_id, +!session.data.selfService)
	}

	if (parsedQuery.data.guild_id) {
		return sendRedirect(event, getRelativePath(event.path, `/guild?guild_id=${parsedQuery.data.guild_id}`), 302)
	}

	return sendRedirect(event, getRelativePath(event.path, "/"), 302)
}))
