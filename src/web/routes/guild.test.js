// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const tryToCatch = require("try-to-catch")
const {router, test} = require("../../../test/web")
const {MatrixServerError} = require("../../matrix/mreq")
const {_getPosition, _filterTo} = require("./guild")

let nonce

test("web guild: access denied when not logged in", async t => {
	const html = await router.test("get", "/guild?guild_id=112760669178241024", {
		sessionData: {
		},
	})
	t.has(html, "You need to log in to manage your servers.")
})

test("web guild: asks to select guild if not selected", async t => {
	const html = await router.test("get", "/guild", {
		sessionData: {
			userID: "1",
			managedGuilds: []
		},
	})
	t.has(html, "Select a server from the top right corner to continue.")
})

test("web guild: access denied when guild id messed up", async t => {
	const html = await router.test("get", "/guild?guild_id=1", {
		sessionData: {
			userID: "1",
			managedGuilds: []
		},
	})
	t.has(html, "the selected server doesn't exist")
})

test("web qr: access denied when guild id messed up", async t => {
	const html = await router.test("get", "/qr?guild_id=1", {
		sessionData: {
			userID: "1",
			managedGuilds: []
		},
	})
	t.has(html, "the selected server doesn't exist")
})

test("web invite: access denied with invalid nonce", async t => {
	const html = await router.test("get", "/invite?nonce=1")
	t.match(html, /This QR code has expired./)
})



test("web guild: can view unbridged guild", async t => {
	const html = await router.test("get", "/guild?guild_id=66192955777486848", {
		sessionData: {
			managedGuilds: ["66192955777486848"]
		}
	})
	t.has(html, `<h1 class="s-page-title--header">Function &amp; Arg</h1>`)
})

test("web guild: unbridged self-service guild prompts log in to matrix", async t => {
	const html = await router.test("get", "/guild?guild_id=665289423482519565", {
		sessionData: {
			managedGuilds: ["665289423482519565"]
		}
	})
	t.has(html, `You picked self-service mode`)
	t.has(html, `You need to log in with Matrix first`)
})

test("web guild: unbridged self-service guild asks to be invited", async t => {
	const html = await router.test("get", "/guild?guild_id=665289423482519565", {
		sessionData: {
			mxid: "@user:example.org",
			managedGuilds: ["665289423482519565"]
		}
	})
	t.has(html, `On Matrix, invite <`)
})

test("web guild: unbridged self-service guild shows available spaces", async t => {
	const html = await router.test("get", "/guild?guild_id=665289423482519565", {
		sessionData: {
			mxid: "@cadence:cadence.moe",
			managedGuilds: ["665289423482519565"]
		}
	})
	t.has(html, `<strong>Data Horde</strong>`)
	t.has(html, `<li>here is the space topic</li>`)
	t.has(html, `<img class="s-avatar--image" src="https://bridge.example.org/download/matrix/cadence.moe/TLqQOsTSrZkVKwBSWYTZNTrw" alt="">`)
	t.notMatch(html, /<strong>some room<\/strong>/)
	t.notMatch(html, /<strong>somebody else's space<\/strong>/)
})


test("web guild: can view bridged guild when logged in with discord", async t => {
	const html = await router.test("get", "/guild?guild_id=112760669178241024", {
		sessionData: {
			managedGuilds: ["112760669178241024"]
		},
		api: {
			async getFullHierarchy(roomID) {
				return []
			}
		}
	})
	t.has(html, `<h1 class="s-page-title--header">Psychonauts 3</h1>`)
})

test("web guild: can view bridged guild when logged in with matrix", async t => {
	const html = await router.test("get", "/guild?guild_id=112760669178241024", {
		sessionData: {
			mxid: "@cadence:cadence.moe"
		},
		api: {
			async getFullHierarchy(roomID) {
				return []
			}
		}
	})
	t.has(html, `<h1 class="s-page-title--header">Psychonauts 3</h1>`)
})

test("web qr: generates nonce", async t => {
	const html = await router.test("get", "/qr?guild_id=112760669178241024", {
		sessionData: {
			managedGuilds: ["112760669178241024"]
		}
	})
	nonce = html.match(/data-nonce="([a-f0-9-]+)"/)?.[1]
	t.ok(nonce)
})

test("web invite: page loads with valid nonce", async t => {
	const html = await router.test("get", `/invite?nonce=${nonce}`)
	t.has(html, "Invite a Matrix user")
})




test("api invite: access denied with nothing", async t => {
	const [error] = await tryToCatch(() =>
		router.test("post", `/api/invite`, {
			body: {
				mxid: "@cadence:cadence.moe",
				permissions: "moderator"
			}
		})
	)
	t.equal(error.message, "Missing guild ID")
})

test("api invite: access denied when not in guild", async t => {
	const [error] = await tryToCatch(() =>
		router.test("post", `/api/invite`, {
			body: {
				mxid: "@cadence:cadence.moe",
				permissions: "moderator",
				guild_id: "112760669178241024"
			}
		})
	)
	t.equal(error.message, "Forbidden")
})

test("api invite: can invite with valid nonce", async t => {
	let called = 0
	const [error] = await tryToCatch(() =>
		router.test("post", `/api/invite`, {
			body: {
				mxid: "@cadence:cadence.moe",
				permissions: "moderator",
				nonce
			},
			api: {
				async getStateEvent(roomID, type, key) {
					called++
					if (type === "m.room.member" && key === "@cadence:cadence.moe") {
						throw new Error("event not found")
					} else if (type === "m.room.power_levels" && key === "") {
						return {}
					}
					/* c8 ignore next */
					t.fail(`unexpected getStateEvent call. roomID: ${roomID}, type: ${type}, key: ${key}`)
				},
				async getStateEventOuter(roomID, type, key) {
					called++
					return {
						type: "m.room.create",
						state_key: "",
						sender: "@_ooye_bot:cadence.moe",
						event_id: "$create",
						origin_server_ts: 0,
						room_id: roomID,
						content: {
							room_version: "11"
						}
					}
				},
				async inviteToRoom(roomID, mxidToInvite, mxid) {
					called++
					t.equal(roomID, "!jjmvBegULiLucuWEHU:cadence.moe")
				},
				async *generateFullHierarchy(spaceID) {
					called++
					yield {
						room_id: "!hierarchy",
						children_state: [],
						guest_can_join: false,
						num_joined_members: 2,
					}
				},
				async sendState(roomID, type, key, content) {
					called++
					t.ok(["!hierarchy", "!jjmvBegULiLucuWEHU:cadence.moe"].includes(roomID), `expected room ID to be in hierarchy, but was ${roomID}`)
					t.equal(type, "m.room.power_levels")
					t.equal(key, "")
					t.deepEqual(content, {
						users: {"@cadence:cadence.moe": 50}
					})
					return "$updated"
				}
			}
		})
	)
	t.notOk(error)
	/*
		1. get membership
		2. invite to room
		set power:
			3. generate hierarchy
			4-5. calculate powers
			6. send state
			7-8. calculate powers
			9. send state
	*/
	t.equal(called, 9) // get membership +
})

test("api invite: access denied when nonce has been used", async t => {
	const [error] = await tryToCatch(() =>
		router.test("post", `/api/invite`, {
			body: {
				mxid: "@cadence:cadence.moe",
				permissions: "moderator",
				nonce
			}
		})
	)
	t.equal(error.message, "Nonce expired")
})

test("api invite: can invite to a moderated guild", async t => {
	let called = 0
	const [error] = await tryToCatch(() =>
		router.test("post", `/api/invite`, {
			body: {
				mxid: "@cadence:cadence.moe",
				permissions: "admin",
				guild_id: "112760669178241024"
			},
			sessionData: {
				managedGuilds: ["112760669178241024"]
			},
			api: {
				async getStateEvent(roomID, type, key) {
					called++
					if (type === "m.room.member" && key === "@cadence:cadence.moe") {
						return {membership: "leave"}
					} else if (type === "m.room.power_levels" && key === "") {
						return {}
					}
					/* c8 ignore next */
					t.fail(`unexpected getStateEvent call. roomID: ${roomID}, type: ${type}, key: ${key}`)
				},
				async getStateEventOuter(roomID, type, key) {
					called++
					return {
						type: "m.room.create",
						state_key: "",
						sender: "@_ooye_bot:cadence.moe",
						event_id: "$create",
						origin_server_ts: 0,
						room_id: roomID,
						content: {
							room_version: "11"
						}
					}
				},
				async inviteToRoom(roomID, mxidToInvite, mxid) {
					called++
					t.equal(roomID, "!jjmvBegULiLucuWEHU:cadence.moe")
				},
				async *generateFullHierarchy(spaceID) {
					called++
					yield {
						room_id: "!hierarchy",
						children_state: [],
						guest_can_join: false,
						num_joined_members: 2,
					}
					yield {
						room_id: spaceID,
						children_state: [],
						guest_can_join: false,
						num_joined_members: 2,
						room_type: "m.space"
					}
				},
				async sendState(roomID, type, key, content) {
					called++
					t.ok(["!hierarchy", "!jjmvBegULiLucuWEHU:cadence.moe"].includes(roomID), `expected room ID to be in hierarchy, but was ${roomID}`)
					t.equal(type, "m.room.power_levels")
					t.equal(key, "")
					t.deepEqual(content, {
						users: {"@cadence:cadence.moe": 100}
					})
					return "$updated"
				}
			}
		})
	)
	t.notOk(error)
	t.equal(called, 9)
})

test("api invite: does not reinvite joined users", async t => {
	let called = 0
	const [error] = await tryToCatch(() =>
		router.test("post", `/api/invite`, {
			body: {
				mxid: "@cadence:cadence.moe",
				permissions: "default",
				guild_id: "112760669178241024"
			},
			sessionData: {
				managedGuilds: ["112760669178241024"]
			},
			api: {
				async getStateEvent(roomID, type, key) {
					called++
					return {membership: "join"}
				}
			}
		})
	)
	t.notOk(error)
	t.equal(called, 1)
})


test("position sorting: sorts like discord does", t => {
	const channelsList = [{
		type: DiscordTypes.ChannelType.GuildText,
		id: "first",
		position: 0
	}, {
		type: DiscordTypes.ChannelType.PublicThread,
		id: "thread",
		parent_id: "first",
	}, {
		type: DiscordTypes.ChannelType.GuildText,
		id: "second",
		position: 1
	}, {
		type: DiscordTypes.ChannelType.GuildVoice,
		id: "voice",
		position: 0
	}, {
		type: DiscordTypes.ChannelType.GuildCategory,
		id: "category",
		position: 0
	}, {
		type: DiscordTypes.ChannelType.GuildText,
		id: "category-first",
		parent_id: "category",
		position: 0
	}, {
		type: DiscordTypes.ChannelType.GuildText,
		id: "category-second",
		parent_id: "category",
		position: 1
	}, {
		type: DiscordTypes.ChannelType.PublicThread,
		id: "category-second-thread",
		parent_id: "category-second",
	}].reverse()
	const channels = new Map(channelsList.map(c => [c.id, c]))
	const sortedChannelIDs = [...channels.values()].sort((a, b) => _getPosition(a, channels) - _getPosition(b, channels)).map(c => c.id)
	t.deepEqual(sortedChannelIDs, ["first", "thread", "second", "voice", "category", "category-first", "category-second", "category-second-thread"])
})

test("filterTo: works", t => {
	const fruit = ["apple", "banana", "apricot"]
	const rest = _filterTo(fruit, f => f[0] === "b")
	t.deepEqual(fruit, ["banana"])
	t.deepEqual(rest, ["apple", "apricot"])
})
