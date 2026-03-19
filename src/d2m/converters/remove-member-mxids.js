// @ts-check

const passthrough = require("../../passthrough")
const {db, select, from} = passthrough

/**
 * @param {string} userID discord user ID that left
 * @param {string} guildID discord guild ID that they left
 */
function removeMemberMxids(userID, guildID) {
	// Get sims for user and remove
	let membership = from("sim").join("sim_member", "mxid").join("channel_room", "room_id")
		.select("room_id", "mxid").where({user_id: userID, guild_id: guildID}).and("ORDER BY room_id, mxid").all()
	membership = membership.concat(from("sim_proxy").join("sim", "user_id").join("sim_member", "mxid").join("channel_room", "room_id")
		.select("room_id", "mxid").where({proxy_owner_id: userID, guild_id: guildID}).and("ORDER BY room_id, mxid").all())

	// Get user installed apps and remove
	/** @type {string[]} */
	let userAppDeletions = []
	// 1. Select apps that have 1 user remaining
	/** @type {Set<string>} */
	const appsWithOneUser = new Set(db.prepare("SELECT app_bot_id FROM app_user_install WHERE guild_id = ? GROUP BY app_bot_id HAVING count(*) = 1").pluck().all(guildID))
	// 2. Select apps installed by this user
	const appsFromThisUser = new Set(select("app_user_install", "app_bot_id", {guild_id: guildID, user_id: userID}).pluck().all())
	if (appsFromThisUser.size) userAppDeletions.push(userID)
	// Then remove user installed apps if this was the last user with them
	const appsToRemove = appsWithOneUser.intersection(appsFromThisUser)
	for (const botID of appsToRemove) {
		// Remove sims for user installed app
		const appRemoval = removeMemberMxids(botID, guildID)
		membership = membership.concat(appRemoval.membership)
		userAppDeletions = userAppDeletions.concat(appRemoval.userAppDeletions)
	}

	return {membership, userAppDeletions}
}

module.exports.removeMemberMxids = removeMemberMxids
