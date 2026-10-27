// @ts-check

const h3 = require("h3")
const {getRequestHeader, createError} = require("h3")
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
 * @returns {ReturnType<typeof h3.useSession<{userID?: string, mxid?: string, managedGuilds?: string[], state?: string, selfService?: boolean, next?: string, password?: string}>>}
 */
function useSession(event) {
	return h3.useSession(event, {password: reg.as_token, maxAge: 365 * 24 * 60 * 60})
}

/**
 * Rejects by throwing createError.
 * @param {h3.H3Event} event
 */
function rejectUrlPreviewer(event) {
	const userAgent = getRequestHeader(event, "User-Agent")
	if (userAgent?.match(/bot|matrix|tuwunel/i)) throw createError({status: 400, data: "Sorry URL previewer, you can't have this URL."})
}

function rejectInvalidNextUrl(next) {
	try {
		var nextOrigin = new URL(next, reg.ooye.bridge_origin).origin
		var expectedOrigin = new URL(reg.ooye.bridge_origin).origin
	} catch (e) {
		throw createError({status: 400, data: `Invalid next URL "${next}", it didn't parse`})
	}
	if (nextOrigin !== expectedOrigin) throw createError({status: 400, data: `Invalid next URL "${next}", it's on the wrong domain`})
}

module.exports.getManagedGuilds = getManagedGuilds
module.exports.useSession = useSession
module.exports.rejectUrlPreviewer = rejectUrlPreviewer
module.exports.rejectInvalidNextUrl = rejectInvalidNextUrl
