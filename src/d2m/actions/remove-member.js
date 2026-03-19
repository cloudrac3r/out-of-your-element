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
		await api.leaveRoom(m.room_id, m.mxid)
	}
}

module.exports.removeMember = removeMember
