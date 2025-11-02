// @ts-check

const tryToCatch = require("try-to-catch")
const {router, test} = require("../../../test/web")
const {MatrixServerError} = require("../../matrix/mreq")
const {select, db} = require("../../passthrough")
const assert = require("assert").strict

test("web link space: access denied when not logged in to Discord", async t => {
	const [error] = await tryToCatch(() => router.test("post", "/api/link-space", {
		sessionData: {
		},
		body: {
			space_id: "!zTMspHVUBhFLLSdmnS:cadence.moe",
			guild_id: "665289423482519565"
		}
	}))
	t.equal(error.data, "Can't edit a guild you don't have Manage Server permissions in")
})

test("web link space: access denied when not logged in to Matrix", async t => {
	const [error] = await tryToCatch(() => router.test("post", "/api/link-space", {
		sessionData: {
			managedGuilds: ["665289423482519565"]
		},
		body: {
			space_id: "!zTMspHVUBhFLLSdmnS:cadence.moe",
			guild_id: "665289423482519565"
		}
	}))
	t.equal(error.data, "Can't link with your Matrix space if you aren't logged in to Matrix")
})

test("web link space: access denied when bot was invited by different user", async t => {
	const [error] = await tryToCatch(() => router.test("post", "/api/link-space", {
		sessionData: {
			managedGuilds: ["665289423482519565"],
			mxid: "@user:example.org"
		},
		body: {
			space_id: "!zTMspHVUBhFLLSdmnS:cadence.moe",
			guild_id: "665289423482519565"
		}
	}))
	t.equal(error.data, "You personally must invite OOYE to that space on Matrix")
})

test("web link space: access denied when guild is already in use", async t => {
	const [error] = await tryToCatch(() => router.test("post", "/api/link-space", {
		sessionData: {
			managedGuilds: ["112760669178241024"],
			mxid: "@cadence:cadence.moe"
		},
		body: {
			space_id: "!jjmvBegULiLucuWEHU:cadence.moe",
			guild_id: "112760669178241024"
		}
	}))
	t.equal(error.data, "Guild ID 112760669178241024 or space ID !jjmvBegULiLucuWEHU:cadence.moe are already bridged and cannot be reused")
})

test("web link space: check that OOYE is joined", async t => {
	let called = 0
	const [error] = await tryToCatch(() => router.test("post", "/api/link-space", {
		sessionData: {
			managedGuilds: ["665289423482519565"],
			mxid: "@cadence:cadence.moe"
		},
		body: {
			space_id: "!zTMspHVUBhFLLSdmnS:cadence.moe",
			guild_id: "665289423482519565"
		},
		api: {
			async joinRoom(roomID) {
				called++
				throw new MatrixServerError({errcode: "M_FORBIDDEN", error: "not allowed to join I guess"})
			}
		}
	}))
	t.equal(error.data, "Unable to join the requested Matrix space. Please invite the bridge to the space and try again. (Server said: M_FORBIDDEN - not allowed to join I guess)")
	t.equal(called, 1)
})

test("web link space: check that OOYE has PL 100 (not missing)", async t => {
	let called = 0
	const [error] = await tryToCatch(() => router.test("post", "/api/link-space", {
		sessionData: {
			managedGuilds: ["665289423482519565"],
			mxid: "@cadence:cadence.moe"
		},
		body: {
			space_id: "!zTMspHVUBhFLLSdmnS:cadence.moe",
			guild_id: "665289423482519565"
		},
		api: {
			async joinRoom(roomID) {
				called++
				return roomID
			},
			async getStateEvent(roomID, type, key) {
				called++
				t.equal(roomID, "!zTMspHVUBhFLLSdmnS:cadence.moe")
				t.equal(type, "m.room.power_levels")
				throw new MatrixServerError({errcode: "M_NOT_FOUND", error: "what if I told you that power levels never existed"})
			}
		}
	}))
	t.equal(error.data, "OOYE needs power level 100 (admin) in the target Matrix space")
	t.equal(called, 2)
})

test("web link space: check that OOYE has PL 100 (not users_default)", async t => {
	let called = 0
	const [error] = await tryToCatch(() => router.test("post", "/api/link-space", {
		sessionData: {
			managedGuilds: ["665289423482519565"],
			mxid: "@cadence:cadence.moe"
		},
		body: {
			space_id: "!zTMspHVUBhFLLSdmnS:cadence.moe",
			guild_id: "665289423482519565"
		},
		api: {
			async joinRoom(roomID) {
				called++
				return roomID
			},
			async getStateEvent(roomID, type, key) {
				called++
				t.equal(roomID, "!zTMspHVUBhFLLSdmnS:cadence.moe")
				t.equal(type, "m.room.power_levels")
				t.equal(key, "")
				return {}
			}
		}
	}))
	t.equal(error.data, "OOYE needs power level 100 (admin) in the target Matrix space")
	t.equal(called, 2)
})

test("web link space: check that OOYE has PL 100 (not 50)", async t => {
	let called = 0
	const [error] = await tryToCatch(() => router.test("post", "/api/link-space", {
		sessionData: {
			managedGuilds: ["665289423482519565"],
			mxid: "@cadence:cadence.moe"
		},
		body: {
			space_id: "!zTMspHVUBhFLLSdmnS:cadence.moe",
			guild_id: "665289423482519565"
		},
		api: {
			async joinRoom(roomID) {
				called++
				return roomID
			},
			async getStateEvent(roomID, type, key) {
				called++
				t.equal(roomID, "!zTMspHVUBhFLLSdmnS:cadence.moe")
				t.equal(type, "m.room.power_levels")
				t.equal(key, "")
				return {users: {"@_ooye_bot:cadence.moe": 50}}
			}
		}
	}))
	t.equal(error.data, "OOYE needs power level 100 (admin) in the target Matrix space")
	t.equal(called, 2)
})

test("web link space: check that inviting user has PL 50", async t => {
	let called = 0
	const [error] = await tryToCatch(() => router.test("post", "/api/link-space", {
		sessionData: {
			managedGuilds: ["665289423482519565"],
			mxid: "@cadence:cadence.moe"
		},
		body: {
			space_id: "!zTMspHVUBhFLLSdmnS:cadence.moe",
			guild_id: "665289423482519565"
		},
		api: {
			async joinRoom(roomID) {
				called++
				return roomID
			},
			async getStateEvent(roomID, type, key) {
				called++
				t.equal(roomID, "!zTMspHVUBhFLLSdmnS:cadence.moe")
				t.equal(type, "m.room.power_levels")
				t.equal(key, "")
				return {users: {"@_ooye_bot:cadence.moe": 100}}
			}
		}
	}))
	t.equal(error.data, "You need to be at least power level 50 (moderator) in the target Matrix space to set up OOYE, but you are currently power level 0.")
	t.equal(called, 2)
})

test("web link space: successfully adds entry to database and loads page", async t => {
	let called = 0
	await router.test("post", "/api/link-space", {
		sessionData: {
			managedGuilds: ["665289423482519565"],
			mxid: "@cadence:cadence.moe"
		},
		body: {
			space_id: "!zTMspHVUBhFLLSdmnS:cadence.moe",
			guild_id: "665289423482519565"
		},
		api: {
			async joinRoom(roomID) {
				called++
				return roomID
			},
			async getStateEvent(roomID, type, key) {
				called++
				t.equal(roomID, "!zTMspHVUBhFLLSdmnS:cadence.moe")
				t.equal(type, "m.room.power_levels")
				t.equal(key, "")
				return {users: {"@_ooye_bot:cadence.moe": 100, "@cadence:cadence.moe": 50}}
			}
		}
	})
	t.equal(called, 2)

	// check that the entry was added to the database
	t.equal(select("guild_space", "privacy_level", {guild_id: "665289423482519565", space_id: "!zTMspHVUBhFLLSdmnS:cadence.moe"}).pluck().get(), 0)

	// check that the guild info page now loads
	const html = await router.test("get", "/guild?guild_id=665289423482519565", {
		sessionData: {
			managedGuilds: ["665289423482519565"],
			mxid: "@cadence:cadence.moe"
		},
		api: {
			async getFullHierarchy(spaceID) {
				return []
			}
		}
	})
	t.has(html, `<h1 class="s-page-title--header">Data Horde</h1>`)
})

// *****

test("web link room: access denied when not logged in to Discord", async t => {
	const [error] = await tryToCatch(() => router.test("post", "/api/link", {
		sessionData: {
		},
		body: {
			discord: "665310973967597573",
			matrix: "!NDbIqNpJyPvfKRnNcr:cadence.moe",
			guild_id: "665289423482519565"
		}
	}))
	t.equal(error.data, "Can't edit a guild you don't have Manage Server permissions in")
})

test("web link room: check that guild exists", async t => {
	const [error] = await tryToCatch(() => router.test("post", "/api/link", {
		sessionData: {
			managedGuilds: ["1"]
		},
		body: {
			discord: "665310973967597573",
			matrix: "!NDbIqNpJyPvfKRnNcr:cadence.moe",
			guild_id: "1"
		}
	}))
	t.equal(error.data, "Discord guild does not exist or bot has not joined it")
})

test("web link room: check that channel exists", async t => {
	const [error] = await tryToCatch(() => router.test("post", "/api/link", {
		sessionData: {
			managedGuilds: ["665289423482519565"]
		},
		body: {
			discord: "1",
			matrix: "!NDbIqNpJyPvfKRnNcr:cadence.moe",
			guild_id: "665289423482519565"
		}
	}))
	t.equal(error.data, "Discord channel does not exist")
})

test("web link room: check that channel is part of guild", async t => {
	const [error] = await tryToCatch(() => router.test("post", "/api/link", {
		sessionData: {
			managedGuilds: ["665289423482519565"]
		},
		body: {
			discord: "112760669178241024",
			matrix: "!NDbIqNpJyPvfKRnNcr:cadence.moe",
			guild_id: "665289423482519565"
		}
	}))
	t.equal(error.data, "Channel ID 112760669178241024 is not part of guild 665289423482519565")
})

test("web link room: check that channel is not already linked", async t => {
	const [error] = await tryToCatch(() => router.test("post", "/api/link", {
		sessionData: {
			managedGuilds: ["112760669178241024"]
		},
		body: {
			discord: "112760669178241024",
			matrix: "!NDbIqNpJyPvfKRnNcr:cadence.moe",
			guild_id: "112760669178241024"
		}
	}))
	t.equal(error.data, "Channel ID 112760669178241024 or room ID !NDbIqNpJyPvfKRnNcr:cadence.moe are already bridged and cannot be reused")
})

test("web link room: checks the autocreate setting if the space doesn't exist yet", async t => {
	let called = 0
	const [error] = await tryToCatch(() => router.test("post", "/api/link", {
		sessionData: {
			managedGuilds: ["665289423482519565"]
		},
		body: {
			discord: "665310973967597573",
			matrix: "!NDbIqNpJyPvfKRnNcr:cadence.moe",
			guild_id: "665289423482519565"
		},
		createSpace: {
			async ensureSpace(guild) {
				called++
				t.equal(guild.id, "665289423482519565")
				// simulate what ensureSpace is intended to check
				const autocreate = 0
				assert.equal(autocreate, 1, "refusing to implicitly create a space for guild 665289423482519565. set the guild_active data first before calling ensureSpace/syncSpace.")
				return ""
			}
		}
	}))
	t.match(error.message, /refusing to implicitly create a space/)
	t.equal(called, 1)
})

test("web link room: check that room is part of space (not in hierarchy)", async t => {
	let called = 0
	const [error] = await tryToCatch(() => router.test("post", "/api/link", {
		sessionData: {
			managedGuilds: ["665289423482519565"]
		},
		body: {
			discord: "665310973967597573",
			matrix: "!NDbIqNpJyPvfKRnNcr:cadence.moe",
			guild_id: "665289423482519565"
		},
		api: {
			async *generateFullHierarchy(spaceID) {
				called++
				t.equal(spaceID, "!zTMspHVUBhFLLSdmnS:cadence.moe")
			}
		}
	}))
	t.equal(error.data, "Matrix room needs to be part of the bridged space")
	t.equal(called, 1)
})

test("web link room: check that bridge can join room (notices lack of via and asks for invite instead)", async t => {
	let called = 0
	const [error] = await tryToCatch(() => router.test("post", "/api/link", {
		sessionData: {
			managedGuilds: ["665289423482519565"]
		},
		body: {
			discord: "665310973967597573",
			matrix: "!NDbIqNpJyPvfKRnNcr:cadence.moe",
			guild_id: "665289423482519565"
		},
		api: {
			async joinRoom(roomID) {
				called++
				throw new MatrixServerError({errcode: "M_FORBIDDEN", error: "not allowed to join I guess"})
			},
			async *generateFullHierarchy(spaceID) {
				called++
				t.equal(spaceID, "!zTMspHVUBhFLLSdmnS:cadence.moe")
				yield {
					room_id: "!NDbIqNpJyPvfKRnNcr:cadence.moe",
					children_state: [],
					guest_can_join: false,
					num_joined_members: 2
				}
				/* c8 ignore next */
			}
		}
	}))
	t.equal(error.data, "Unable to join the requested Matrix room. Please invite the bridge to the room and try again. (Server said: M_FORBIDDEN - not allowed to join I guess)")
	t.equal(called, 2)
})

test("web link room: check that bridge can join room (uses via for join attempt)", async t => {
	let called = 0
	const [error] = await tryToCatch(() => router.test("post", "/api/link", {
		sessionData: {
			managedGuilds: ["665289423482519565"]
		},
		body: {
			discord: "665310973967597573",
			matrix: "!NDbIqNpJyPvfKRnNcr:cadence.moe",
			guild_id: "665289423482519565"
		},
		api: {
			async joinRoom(roomID, _, via) {
				called++
				t.deepEqual(via, ["cadence.moe", "hashi.re"])
				throw new MatrixServerError({errcode: "M_FORBIDDEN", error: "not allowed to join I guess"})
			},
			async *generateFullHierarchy(spaceID) {
				called++
				t.equal(spaceID, "!zTMspHVUBhFLLSdmnS:cadence.moe")
				yield {
					room_id: "!NDbIqNpJyPvfKRnNcr:cadence.moe",
					children_state: [],
					guest_can_join: false,
					num_joined_members: 2
				}
				yield {
					room_id: "!zTMspHVUBhFLLSdmnS:cadence.moe",
					children_state: [{
						type: "m.space.child",
						state_key: "!NDbIqNpJyPvfKRnNcr:cadence.moe",
						sender: "@elliu:hashi.re",
						content: {
							via: ["cadence.moe", "hashi.re"]
						},
						origin_server_ts: 0
					}],
					guest_can_join: false,
					num_joined_members: 2
				}
				/* c8 ignore next */
			}
		}
	}))
	t.equal(error.data, "M_FORBIDDEN - not allowed to join I guess")
	t.equal(called, 2)
})

test("web link room: check that bridge has PL 100 in target room (event missing)", async t => {
	let called = 0
	const [error] = await tryToCatch(() => router.test("post", "/api/link", {
		sessionData: {
			managedGuilds: ["665289423482519565"]
		},
		body: {
			discord: "665310973967597573",
			matrix: "!NDbIqNpJyPvfKRnNcr:cadence.moe",
			guild_id: "665289423482519565"
		},
		api: {
			async joinRoom(roomID) {
				called++
				return roomID
			},
			async *generateFullHierarchy(spaceID) {
				called++
				t.equal(spaceID, "!zTMspHVUBhFLLSdmnS:cadence.moe")
				yield {
					room_id: "!NDbIqNpJyPvfKRnNcr:cadence.moe",
					children_state: [],
					guest_can_join: false,
					num_joined_members: 2
				}
				/* c8 ignore next */
			},
			async getStateEvent(roomID, type, key) {
				called++
				t.equal(roomID, "!NDbIqNpJyPvfKRnNcr:cadence.moe")
				t.equal(type, "m.room.power_levels")
				t.equal(key, "")
				throw new MatrixServerError({errcode: "M_NOT_FOUND", error: "what if I told you there's no such thing as power levels"})
			}
		}
	}))
	t.equal(error.data, "OOYE needs power level 100 (admin) in the target Matrix room")
	t.equal(called, 3)
})

test("web link room: check that bridge has PL 100 in target room (users default)", async t => {
	let called = 0
	const [error] = await tryToCatch(() => router.test("post", "/api/link", {
		sessionData: {
			managedGuilds: ["665289423482519565"]
		},
		body: {
			discord: "665310973967597573",
			matrix: "!NDbIqNpJyPvfKRnNcr:cadence.moe",
			guild_id: "665289423482519565"
		},
		api: {
			async joinRoom(roomID) {
				called++
				return roomID
			},
			async *generateFullHierarchy(spaceID) {
				called++
				t.equal(spaceID, "!zTMspHVUBhFLLSdmnS:cadence.moe")
				yield {
					room_id: "!NDbIqNpJyPvfKRnNcr:cadence.moe",
					children_state: [],
					guest_can_join: false,
					num_joined_members: 2
				}
				/* c8 ignore next */
			},
			async getStateEvent(roomID, type, key) {
				called++
				t.equal(roomID, "!NDbIqNpJyPvfKRnNcr:cadence.moe")
				t.equal(type, "m.room.power_levels")
				t.equal(key, "")
				return {users_default: 50}
			}
		}
	}))
	t.equal(error.data, "OOYE needs power level 100 (admin) in the target Matrix room")
	t.equal(called, 3)
})

test("web link room: successfully calls createRoom", async t => {
	let called = 0
	await router.test("post", "/api/link", {
		sessionData: {
			managedGuilds: ["665289423482519565"]
		},
		body: {
			discord: "665310973967597573",
			matrix: "!NDbIqNpJyPvfKRnNcr:cadence.moe",
			guild_id: "665289423482519565"
		},
		api: {
			async joinRoom(roomID) {
				called++
				return roomID
			},
			async *generateFullHierarchy(spaceID) {
				called++
				t.equal(spaceID, "!zTMspHVUBhFLLSdmnS:cadence.moe")
				yield {
					room_id: "!NDbIqNpJyPvfKRnNcr:cadence.moe",
					children_state: [],
					guest_can_join: false,
					num_joined_members: 2
				}
				/* c8 ignore next */
			},
			async getStateEvent(roomID, type, key) {
				if (type === "m.room.power_levels") {
					called++
					t.equal(roomID, "!NDbIqNpJyPvfKRnNcr:cadence.moe")
					t.equal(key, "")
					return {users: {"@_ooye_bot:cadence.moe": 100}}
				} else if (type === "m.room.name") {
					called++
					t.equal(roomID, "!NDbIqNpJyPvfKRnNcr:cadence.moe")
					return {}
				} else if (type === "m.room.avatar") {
					called++
					t.equal(roomID, "!NDbIqNpJyPvfKRnNcr:cadence.moe")
					return {}
				} else if (type === "m.room.topic") {
					called++
					t.equal(roomID, "!NDbIqNpJyPvfKRnNcr:cadence.moe")
					return {}
				}
			},
			async sendEvent(roomID, type, content) {
				called++
				t.equal(roomID, "!NDbIqNpJyPvfKRnNcr:cadence.moe")
				t.equal(type, "m.room.message")
				t.match(content.body, /👋/)
				return ""
			}
		},
		createRoom: {
			async syncRoom(channelID) {
				called++
				t.equal(channelID, "665310973967597573")
				return "!NDbIqNpJyPvfKRnNcr:cadence.moe"
			}
		}
	})
	t.equal(called, 8)
})

// *****

test("web unlink room: access denied if not logged in to Discord", async t => {
	const [error] = await tryToCatch(() => router.test("post", "/api/unlink", {
		body: {
			channel_id: "665310973967597573",
			guild_id: "665289423482519565"
		}
	}))
	t.equal(error.data, "Can't edit a guild you don't have Manage Server permissions in")
})

test("web unlink room: checks that guild exists", async t => {
	const [error] = await tryToCatch(() => router.test("post", "/api/unlink", {
		sessionData: {
			managedGuilds: ["2"]
		},
		body: {
			channel_id: "665310973967597573",
			guild_id: "2"
		}
	}))
	t.equal(error.data, "Discord guild does not exist or bot has not joined it")
})

test("web unlink room: checks that the channel is part of the guild", async t => {
	const [error] = await tryToCatch(() => router.test("post", "/api/unlink", {
		sessionData: {
			managedGuilds: ["665289423482519565"]
		},
		body: {
			channel_id: "112760669178241024",
			guild_id: "665289423482519565"
		}
	}))
	t.equal(error.data, "Channel ID 112760669178241024 is not part of guild 665289423482519565")
})

test("web unlink room: successfully calls unbridgeDeletedChannel when the channel does exist", async t => {
	let called = 0
	await router.test("post", "/api/unlink", {
		sessionData: {
			managedGuilds: ["665289423482519565"]
		},
		body: {
			channel_id: "665310973967597573",
			guild_id: "665289423482519565"
		},
		createRoom: {
			async unbridgeDeletedChannel(channel) {
				called++
				t.equal(channel.id, "665310973967597573")
			}
		}
	})
	t.equal(called, 1)
})

test("web unlink room: successfully calls unbridgeDeletedChannel when the channel does not exist", async t => {
	let called = 0
	await router.test("post", "/api/unlink", {
		sessionData: {
			managedGuilds: ["112760669178241024"]
		},
		body: {
			channel_id: "489237891895768942",
			guild_id: "112760669178241024"
		},
		createRoom: {
			async unbridgeDeletedChannel(channel) {
				called++
				t.equal(channel.id, "489237891895768942")
			}
		}
	})
	t.equal(called, 1)
})

test("web unlink room: checks that the channel is bridged", async t => {
	db.prepare("DELETE FROM channel_room WHERE channel_id = '665310973967597573'").run()
	const [error] = await tryToCatch(() => router.test("post", "/api/unlink", {
		sessionData: {
			managedGuilds: ["665289423482519565"]
		},
		body: {
			channel_id: "665310973967597573",
			guild_id: "665289423482519565"
		}
	}))
	t.equal(error.data, "Channel ID 665310973967597573 is not currently bridged")
})
