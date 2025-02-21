// @ts-check

const tryToCatch = require("try-to-catch")
const {router, test} = require("../../../test/web")
const {select} = require("../../passthrough")
const {MatrixServerError} = require("../../matrix/mreq")

test("web autocreate: checks permissions", async t => {
	const [error] = await tryToCatch(() => router.test("post", "/api/autocreate", {
		body: {
			guild_id: "66192955777486848"
		}
	}))
	t.equal(error.data, "Can't change settings for a guild you don't have Manage Server permissions in")
})


test("web autocreate: turns off autocreate and does htmx page refresh when guild not linked", async t => {
	const event = {}
	await router.test("post", "/api/autocreate", {
		sessionData: {
			managedGuilds: ["66192955777486848"]
		},
		body: {
			guild_id: "66192955777486848",
			// autocreate is false
		},
		headers: {
			"hx-request": "true"
		},
		event
	})
	t.equal(event.node.res.getHeader("hx-refresh"), "true")
	t.equal(select("guild_active", "autocreate", {guild_id: "66192955777486848"}).pluck().get(), 0)
})

test("web autocreate: turns on autocreate and issues 302 when not using htmx", async t => {
	const event = {}
	await router.test("post", "/api/autocreate", {
		sessionData: {
			managedGuilds: ["66192955777486848"]
		},
		body: {
			guild_id: "66192955777486848",
			autocreate: "yes"
		},
		event
	})
	t.equal(event.node.res.getHeader("location"), "")
	t.equal(select("guild_active", "autocreate", {guild_id: "66192955777486848"}).pluck().get(), 1)
})

test("web privacy level: checks permissions", async t => {
	const [error] = await tryToCatch(() => router.test("post", "/api/privacy-level", {
		body: {
			guild_id: "112760669178241024",
			privacy_level: "directory"
		}
	}))
	t.equal(error.data, "Can't change settings for a guild you don't have Manage Server permissions in")
})

test("web privacy level: updates privacy level", async t => {
	let called = 0
	await router.test("post", "/api/privacy-level", {
		sessionData: {
			managedGuilds: ["112760669178241024"]
		},
		body: {
			guild_id: "112760669178241024",
			privacy_level: "directory"
		},
		createSpace: {
			async syncSpaceFully(guildID) {
				called++
				t.equal(guildID, "112760669178241024")
				return ""
			}
		}
	})
	t.equal(called, 1)
	t.equal(select("guild_space", "privacy_level", {guild_id: "112760669178241024"}).pluck().get(), 2) // directory = 2
})

test("web presence: updates presence", async t => {
	await router.test("post", "/api/presence", {
		sessionData: {
			managedGuilds: ["112760669178241024"]
		},
		body: {
			guild_id: "112760669178241024"
			// presence is on by default - turn it off
		}
	})
	t.equal(select("guild_space", "presence", {guild_id: "112760669178241024"}).pluck().get(), 0)
})
