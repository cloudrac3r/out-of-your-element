// @ts-check

const {db, from} = require("../passthrough")
const {reg} = require("./read-registration")
const ks = require("./kstate")

/** Apply global power level requests across ALL rooms where the member cache entry exists but the power level has not been applied yet. */
function _getAffectedRooms() {
	return from("member_cache")
		.join("member_power", "mxid")
		.join("channel_room", "room_id") // only include rooms that are bridged
		.and("where member_power.room_id = '*' and member_cache.power_level != member_power.power_level")
		.selectUnsafe("mxid", "member_cache.room_id", "member_power.power_level")
		.all()
}

async function applyPower() {
	// Migrate reg.ooye.invite setting to database
	for (const mxid of reg.ooye.invite) {
		db.prepare("INSERT OR IGNORE INTO member_power (mxid, room_id, power_level) VALUES (?, ?, 100)").run(mxid, "*")
	}

	const rows = _getAffectedRooms()
	for (const row of rows) {
		const kstate = await ks.roomToKState(row.room_id)
		const diff = ks.diffKState(kstate, {"m.room.power_levels/": {users: {[row.mxid]: row.power_level}}})
		await ks.applyKStateDiffToRoom(row.room_id, diff)
		// There is a listener on m.room.power_levels to do this same update,
		// but we update it here anyway since the homeserver does not always deliver the event round-trip.
		db.prepare("UPDATE member_cache SET power_level = ? WHERE room_id = ? AND mxid = ?").run(row.power_level, row.room_id, row.mxid)
	}
}

module.exports._getAffectedRooms = _getAffectedRooms
module.exports.applyPower = applyPower
