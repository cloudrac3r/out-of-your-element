// @ts-check

const {z} = require("zod")
const {randomUUID} = require("crypto")
const {defineEventHandler, getValidatedQuery, sendRedirect, createError} = require("h3")
const {SnowTransfer, tokenless} = require("snowtransfer")
const DiscordTypes = require("discord-api-types/v10")
const getRelativePath = require("get-relative-path")

const {discord, as, db, sync} = require("../../passthrough")
const {id} = require("../../../addbot")
/** @type {import("../auth")} */
const auth = sync.require("../auth")
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
		expires_in: z.coerce.number(),
		refresh_token: z.string(),
		scope: z.string()
	})
}

as.router.get("/oauth", defineEventHandler(async event => {
	const session = await auth.useSession(event)
	let scope = "guilds"

	if (!reg.ooye.web_password || reg.ooye.web_password === session.data.password) {
		const parsedFirstQuery = await getValidatedQuery(event, schema.first.safeParse)
		if (parsedFirstQuery.data?.action === "add") {
			scope = "bot+guilds"
			await session.update({selfService: false})
		} else if (parsedFirstQuery.data?.action === "add-self-service") {
			scope = "bot+guilds"
			await session.update({selfService: true})
		}
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

	const oauthResult = await tokenless.getOauth2Token(id, redirect_uri, reg.ooye.discord_client_secret, parsedQuery.data.code)
	const parsedToken = schema.token.safeParse(oauthResult)
	if (!parsedToken.success) {
		throw createError({status: 502, message: "Invalid token response", data: `Discord completed OAuth, but returned this instead of an OAuth access token: ${JSON.stringify(oauthResult)}`})
	}

	const userID = Buffer.from(parsedToken.data.access_token.split(".")[0], "base64").toString()
	const client = new SnowTransfer(`Bearer ${parsedToken.data.access_token}`)
	try {
		const guilds = await client.user.getGuilds()
		var managedGuilds = guilds.filter(g => BigInt(g.permissions) & DiscordTypes.PermissionFlagsBits.ManageGuild).map(g => g.id)
		await session.update({managedGuilds, userID, state: undefined})
	} catch (e) {
		throw createError({status: 502, message: "API call failed", data: e.message})
	}

	// Set auto-create for the guild
	// @ts-ignore
	if (managedGuilds.includes(parsedQuery.data.guild_id)) {
		const autocreateInteger = +!session.data.selfService
		db.prepare("INSERT INTO guild_active (guild_id, autocreate) VALUES (?, ?) ON CONFLICT DO UPDATE SET autocreate = ?").run(parsedQuery.data.guild_id, autocreateInteger, autocreateInteger)
	}

	if (parsedQuery.data.guild_id) {
		return sendRedirect(event, getRelativePath(event.path, `/guild?guild_id=${parsedQuery.data.guild_id}`), 302)
	}

	return sendRedirect(event, getRelativePath(event.path, "/"), 302)
}))
