// @ts-check

const assert = require("assert")
const reg = require("../../matrix/read-registration")

const passthrough = require("../../passthrough")
const { discord, sync, db } = passthrough
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")
/** @type {import("../converters/user-to-mxid")} */
const userToMxid = sync.require("../converters/user-to-mxid")

/**
 * A sim is an account that is being simulated by the bridge to copy events from the other side.
 * @param {import("discord-api-types/v10").APIUser} user
 * @returns mxid
 */
async function createSim(user) {
	// Choose sim name
	const simName = userToMxid.userToSimName(user)
	const localpart = reg.namespace_prefix + simName
	const mxid = "@" + localpart + ":cadence.moe"

	// Save chosen name in the database forever
	// Making this database change right away so that in a concurrent registration, the 2nd registration will already have generated a different localpart because it can see this row when it generates
	db.prepare("INSERT INTO sim (discord_id, sim_name, localpart, mxid) VALUES (?, ?, ?, ?)").run(user.id, simName, localpart, mxid)

	// Register matrix user with that name
	try {
		await api.register(localpart)
	} catch (e) {
		// If user creation fails, manually undo the database change. Still isn't perfect, but should help.
		// (A transaction would be preferable, but I don't think it's safe to leave transaction open across event loop ticks.)
		db.prepare("DELETE FROM sim WHERE discord_id = ?").run(user.id)
		throw e
	}
	return mxid
}

/**
 * Ensure a sim is registered for the user.
 * If there is already a sim, use that one. If there isn't one yet, register a new sim.
 * @returns mxid
 */
async function ensureSim(user) {
	let mxid = null
	const existing = db.prepare("SELECT mxid FROM sim WHERE discord_id = ?").pluck().get(user.id)
	if (existing) {
		mxid = existing
	} else {
		mxid = await createSim(user)
	}
	return mxid
}

/**
 * Ensure a sim is registered for the user and is joined to the room.
 * @returns mxid
 */
async function ensureSimJoined(user, roomID) {
	// Ensure room ID is really an ID, not an alias
	assert.ok(roomID[0] === "!")

	// Ensure user
	const mxid = await ensureSim(user)

	// Ensure joined
	const existing = db.prepare("SELECT * FROM sim_member WHERE room_id = ? and mxid = ?").get(roomID, mxid)
	if (!existing) {
		await api.inviteToRoom(roomID, mxid)
		await api.joinRoom(roomID, mxid)
		db.prepare("INSERT INTO sim_member (room_id, mxid) VALUES (?, ?)").run(roomID, mxid)
	}
	return mxid
}

module.exports.ensureSim = ensureSim
module.exports.ensureSimJoined = ensureSimJoined
