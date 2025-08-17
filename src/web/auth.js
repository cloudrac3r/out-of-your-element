// @ts-check

const h3 = require("h3")
const {db} = require("../passthrough")
const {reg} = require("../matrix/read-registration")

/**
 * Combined guilds managed by Discord account + Matrix account.
 * @param {h3.H3Event} event
 * @returns {Promise<Set<string>>} guild IDs
 */
async function getManagedGuilds(event) {
	const session = await useSession(event)
	const managed = new Set(session.data.managedGuilds || [])
	if (session.data.mxid) {
		const matrixGuilds = db.prepare("SELECT guild_id FROM guild_space INNER JOIN member_cache ON space_id = room_id WHERE mxid = ? AND power_level >= 50").pluck().all(session.data.mxid)
		for (const id of matrixGuilds) {
			managed.add(id)
		}
	}
	return managed
}

/**
 * @param {h3.H3Event} event
 * @returns {ReturnType<typeof h3.useSession<{userID?: string, mxid?: string, managedGuilds?: string[], state?: string, selfService?: boolean, password?: string}>>}
 */
function useSession(event) {
	return h3.useSession(event, {password: reg.as_token, maxAge: 365 * 24 * 60 * 60})
}

module.exports.getManagedGuilds = getManagedGuilds
module.exports.useSession = useSession
