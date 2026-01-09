// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const tryToCatch = require("try-to-catch")
const assert = require("assert/strict")
const {router, test} = require("../../../test/web")

test("web oauth: redirects to Discord on first visit (add easy)", async t => {
	let event = {}
	await router.test("get", "/oauth?action=add", {
		event,
		sessionData: {
			password: "password123"
		}
	})
	t.equal(event.node.res.statusCode, 302)
	t.match(event.node.res.getHeader("location"), /^https:\/\/discord.com\/oauth2\/authorize\?client_id=684280192553844747&scope=bot\+guilds&permissions=2251801424568320&response_type=code&redirect_uri=https:\/\/bridge\.example\.org\/oauth&state=/)
})

test("web oauth: redirects to Discord on first visit (add self service)", async t => {
	let event = {}
	await router.test("get", "/oauth?action=add-self-service", {
		event,
		sessionData: {
			password: "password123"
		}
	})
	t.equal(event.node.res.statusCode, 302)
	t.match(event.node.res.getHeader("location"), /^https:\/\/discord.com\/oauth2\/authorize\?client_id=684280192553844747&scope=bot\+guilds&permissions=2251801424568320&response_type=code&redirect_uri=https:\/\/bridge\.example\.org\/oauth&state=/)
})

test("web oauth: advises user about cookies if state is missing", async t => {
	let event = {}
	const [e] = await tryToCatch(() => router.test("get", "/oauth?state=693551d5-47c5-49e2-a433-3600abe3c15c&code=DISCORD_CODE&guild_id=9", {
		event
	}))
	t.equal(e.message, "Missing state")
})

test("web oauth: redirects to Discord again if state doesn't match", async t => {
	let event = {}
	await router.test("get", "/oauth?state=693551d5-47c5-49e2-a433-3600abe3c15c&code=DISCORD_CODE", {
		event,
		sessionData: {
			state: "438aa253-1311-4483-9aa2-c251e29e72c9",
			password: "password123"
		}
	})
	t.equal(event.node.res.statusCode, 302)
	t.match(event.node.res.getHeader("location"), /^https:\/\/discord\.com\/oauth2\/authorize/)
})

test("web oauth: uses returned state, logs in", async t => {
	let event = {}
	await router.test("get", "/oauth?state=693551d5-47c5-49e2-a433-3600abe3c15c&code=DISCORD_CODE", {
		event,
		sessionData: {
			state: "693551d5-47c5-49e2-a433-3600abe3c15c",
			selfService: false,
			password: "password123"
		},
		getOauth2Token() {
			return {
				token_type: "Bearer",
				access_token: "6qrZcUqja7812RVdnEKjpzOL4CvHBFG",
				expires_in: 604800,
				refresh_token: "D43f5y0ahjqew82jZ4NViEr2YafMKhue",
				scope: "bot+guilds"
			}
		},
		getClient(accessToken) {
			return {
				user: {
					async getGuilds() {
						return [{
							id: "9",
							permissions: DiscordTypes.PermissionFlagsBits.ManageGuild
						}]
					}
				}
			}
		}
	})
	t.equal(event.node.res.statusCode, 302)
	t.equal(event.node.res.getHeader("location"), "./")
})

test("web oauth: uses returned state, adds managed guild", async t => {
	let event = {}
	await router.test("get", "/oauth?state=693551d5-47c5-49e2-a433-3600abe3c15c&code=DISCORD_CODE&guild_id=9", {
		event,
		sessionData: {
			state: "693551d5-47c5-49e2-a433-3600abe3c15c",
			selfService: false,
			password: "password123"
		},
		getOauth2Token() {
			return {
				token_type: "Bearer",
				access_token: "6qrZcUqja7812RVdnEKjpzOL4CvHBFG",
				expires_in: 604800,
				refresh_token: "D43f5y0ahjqew82jZ4NViEr2YafMKhue",
				scope: "bot+guilds"
			}
		},
		getClient(accessToken) {
			return {
				user: {
					async getGuilds() {
						return [{
							id: "9",
							permissions: DiscordTypes.PermissionFlagsBits.ManageGuild
						}]
					}
				}
			}
		}
	})
	t.equal(event.node.res.statusCode, 302)
	t.equal(event.node.res.getHeader("location"), "guild?guild_id=9")
})
