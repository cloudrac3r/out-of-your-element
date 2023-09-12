// @ts-check

const reg = require("../../matrix/read-registration")
const userRegex = reg.namespaces.users.map(u => new RegExp(u.regex))
/**
 * Determine whether an event is the bridged representation of a discord message.
 * Such messages shouldn't be bridged again.
 * @param {string} sender
 */
function eventSenderIsFromDiscord(sender) {
	// If it's from a user in the bridge's namespace, then it originated from discord
	// This includes messages sent by the appservice's bot user, because that is what's used for webhooks
	// TODO: It would be nice if bridge system messages wouldn't trigger this check and could be bridged from matrix to discord, while webhook reflections would remain ignored...
	// TODO that only applies to the above todo: But you'd have to watch out for the /icon command, where the bridge bot would set the room avatar, and that shouldn't be reflected into the room a second time.
	if (userRegex.some(x => sender.match(x))) {
		return true
	}

	return false
}

/**
 * @param {string} mxc
 * @returns {string?}
 */
function getPublicUrlForMxc(mxc) {
	const avatarURLParts = mxc?.match(/^mxc:\/\/([^/]+)\/(\w+)$/)
	if (avatarURLParts) return `${reg.ooye.server_origin}/_matrix/media/r0/download/${avatarURLParts[1]}/${avatarURLParts[2]}`
	else return null
}

module.exports.eventSenderIsFromDiscord = eventSenderIsFromDiscord
module.exports.getPublicUrlForMxc = getPublicUrlForMxc
