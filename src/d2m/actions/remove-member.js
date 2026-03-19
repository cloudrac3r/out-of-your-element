// @ts-check

const passthrough = require("../../passthrough")
const {sync, db, select, from} = passthrough
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("../converters/remove-member-mxids")} */
const removeMemberMxids = sync.require("../converters/remove-member-mxids")

/**
 * @param {string} userID discord user ID that left
 * @param {string} guildID discord guild ID that they left
 */
async function removeMember(userID, guildID) {
	const {userAppDeletions, membership} = removeMemberMxids.removeMemberMxids(userID, guildID)
	db.transaction(() => {
		for (const d of userAppDeletions) {
			db.prepare("DELETE FROM app_user_install WHERE guild_id = ? and user_id = ?").run(guildID, d)
		}
	})()
	for (const m of membership) {
		try {
			await api.leaveRoom(m.room_id, m.mxid)
		} catch (e) {
			if (String(e).includes("not in room")) {
				// no further action needed
			} else {
				throw e
			}
		}
		// Update cache to say that the member isn't in the room any more
		// You'd think this would happen automatically when the leave event arrives at Matrix's event dispatcher, but that isn't 100% reliable.
		db.prepare("DELETE FROM sim_member WHERE room_id = ? AND mxid = ?").run(m.room_id, m.mxid)
	}
}

module.exports.removeMember = removeMember
