// @ts-check

const tryToCatch = require("try-to-catch")
const {test} = require("supertape")
const {router} = require("../../../test/web")
const {MatrixServerError} = require("../../matrix/mreq")

let nonce

test("web guild: access denied when not logged in", async t => {
	const content = await router.test("get", "/guild?guild_id=112760669178241024", {
		sessionData: {
		},
	})
	t.match(content, /You need to log in to manage your servers./)
})

test("web guild: asks to select guild if not selected", async t => {
	const content = await router.test("get", "/guild", {
		sessionData: {
			managedGuilds: []
		},
	})
	t.match(content, /Select a server from the top right corner to continue./)
})

test("web guild: access denied when guild id messed up", async t => {
	const content = await router.test("get", "/guild?guild_id=1", {
		sessionData: {
			managedGuilds: []
		},
	})
	t.match(content, /the selected server doesn't exist/)
})




test("web invite: access denied with invalid nonce", async t => {
	const content = await router.test("get", "/invite?nonce=1")
	t.match(content, /This QR code has expired./)
})

test("web guild: can view guild", async t => {
	const content = await router.test("get", "/guild?guild_id=112760669178241024", {
		sessionData: {
			managedGuilds: ["112760669178241024"]
		},
		api: {
			async getStateEvent(roomID, type, key) {
				return {}
			},
			async getMembers(roomID, membership) {
				return {chunk: []}
			},
			async getFullHierarchy(roomID) {
				return []
			}
		}
	})
	t.match(content, /<h1[^<]*Psychonauts 3/)
	nonce = content.match(/nonce%3D([a-f0-9-]+)/)?.[1]
	t.ok(nonce)
})

test("web invite: page loads with valid nonce", async t => {
	const content = await router.test("get", `/invite?nonce=${nonce}`)
	t.match(content, /Invite a Matrix user/)
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
					return {membership: "leave"}
				},
				async inviteToRoom(roomID, mxidToInvite, mxid) {
					t.equal(roomID, "!jjWAGMeQdNrVZSSfvz:cadence.moe")
					called++
				},
				async setUserPowerCascade(roomID, mxid, power) {
					t.equal(power, 50) // moderator
					called++
				}
			}
		})
	)
	t.notOk(error)
	t.equal(called, 3)
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
				permissions: "default",
				guild_id: "112760669178241024"
			},
			sessionData: {
				managedGuilds: ["112760669178241024"]
			},
			api: {
				async getStateEvent(roomID, type, key) {
					called++
					throw new MatrixServerError({errcode: "M_NOT_FOUND", error: "Event not found or something"})
				},
				async inviteToRoom(roomID, mxidToInvite, mxid) {
					t.equal(roomID, "!jjWAGMeQdNrVZSSfvz:cadence.moe")
					called++
				},
				async setUserPowerCascade(roomID, mxid, power) {
					t.equal(power, 0)
					called++
				}
			}
		})
	)
	t.notOk(error)
	t.equal(called, 3)
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
				},
				async setUserPowerCascade(roomID, mxid, power) {
					t.equal(power, 0)
					called++
				}
			}
		})
	)
	t.notOk(error)
	t.equal(called, 2)
})
