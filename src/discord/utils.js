// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const assert = require("assert").strict

const {reg} = require("../matrix/read-registration")

const {db} = require("../passthrough")

/** @type {import("xxhash-wasm").XXHashAPI} */ // @ts-ignore
let hasher = null
// @ts-ignore
require("xxhash-wasm")().then(h => hasher = h)

const EPOCH = 1420070400000

/**
 * @param {string[]} userRoles
 * @param {DiscordTypes.APIGuild["roles"]} guildRoles
 * @param {string} [userID]
 * @param {DiscordTypes.APIGuildChannel["permission_overwrites"]} [channelOverwrites]
 */
function getPermissions(userRoles, guildRoles, userID, channelOverwrites) {
	let allowed = BigInt(0)
	let everyoneID
	// Guild allows
	for (const role of guildRoles) {
		if (role.name === "@everyone") {
			allowed |= BigInt(role.permissions)
			everyoneID = role.id
		}
		if (userRoles.includes(role.id)) {
			allowed |= BigInt(role.permissions)
		}
	}

	if (channelOverwrites) {
		/** @type {((overwrite: Required<DiscordTypes.APIOverwrite>) => any)[]} */
		const actions = [
			// Channel @everyone deny
			overwrite => overwrite.id === everyoneID && (allowed &= ~BigInt(overwrite.deny)),
			// Channel @everyone allow
			overwrite => overwrite.id === everyoneID && (allowed |= BigInt(overwrite.allow)),
			// Role deny
			overwrite => userRoles.includes(overwrite.id) && (allowed &= ~BigInt(overwrite.deny)),
			// Role allow
			overwrite => userRoles.includes(overwrite.id) && (allowed |= BigInt(overwrite.allow)),
			// User deny
			overwrite => overwrite.id === userID && (allowed &= ~BigInt(overwrite.deny)),
			// User allow
			overwrite => overwrite.id === userID && (allowed |= BigInt(overwrite.allow))
		]
		for (let i = 0; i < actions.length; i++) {
			for (const overwrite of channelOverwrites) {
				actions[i](overwrite)
			}
		}
	}
	return allowed
}

/**
 * Note: You can only provide one permission bit to permissionToCheckFor. To check multiple permissions, call `hasAllPermissions` or `hasSomePermissions`.
 * It is designed like this to avoid developer error with bit manipulations.
 *
 * @param {bigint} resolvedPermissions
 * @param {bigint} permissionToCheckFor
 * @returns {boolean} whether the user has the requested permission
 * @example
 * const permissions = getPermissions(userRoles, guildRoles, userID, channelOverwrites)
 * hasPermission(permissions, DiscordTypes.PermissionFlagsBits.ViewChannel)
 */
function hasPermission(resolvedPermissions, permissionToCheckFor) {
	// Make sure permissionToCheckFor has exactly one permission in it
	assert.equal(permissionToCheckFor.toString(2).match(/1/g)?.length, 1)
	// Do the actual calculation
	return (resolvedPermissions & permissionToCheckFor) === permissionToCheckFor
}

/**
 * @param {bigint} resolvedPermissions
 * @param {(keyof DiscordTypes.PermissionFlagsBits)[]} permissionsToCheckFor
 * @returns {boolean} whether the user has any of the requested permissions
 * @example
 * const permissions = getPermissions(userRoles, guildRoles, userID, channelOverwrites)
 * hasSomePermissions(permissions, ["ViewChannel", "ReadMessageHistory"])
 */
function hasSomePermissions(resolvedPermissions, permissionsToCheckFor) {
	return permissionsToCheckFor.some(x => hasPermission(resolvedPermissions, DiscordTypes.PermissionFlagsBits[x]))
}

/**
 * @param {bigint} resolvedPermissions
 * @param {(keyof DiscordTypes.PermissionFlagsBits)[]} permissionsToCheckFor
 * @returns {boolean} whether the user has all of the requested permissions
 * @example
 * const permissions = getPermissions(userRoles, guildRoles, userID, channelOverwrites)
 * hasAllPermissions(permissions, ["ViewChannel", "ReadMessageHistory"])
 */
function hasAllPermissions(resolvedPermissions, permissionsToCheckFor) {
	return permissionsToCheckFor.every(x => hasPermission(resolvedPermissions, DiscordTypes.PermissionFlagsBits[x]))
}

/**
 * Command interaction responses have a webhook_id for some reason, but still have real author info of a real bot user in the server.
 * @param {DiscordTypes.APIMessage} message
 */
function isWebhookMessage(message) {
	return message.webhook_id && message.type !== DiscordTypes.MessageType.ChatInputCommand
}

/**
 * @param {Pick<DiscordTypes.APIMessage, "flags">} message
 */
function isEphemeralMessage(message) {
	return Boolean(message.flags && (message.flags & DiscordTypes.MessageFlags.Ephemeral))
}

/** @param {string} snowflake */
function snowflakeToTimestampExact(snowflake) {
	return Number(BigInt(snowflake) >> 22n) + EPOCH
}

/** @param {number} timestamp */
function timestampToSnowflakeInexact(timestamp) {
	return String((timestamp - EPOCH) * 2**22)
}

/** @param {string} url */
function getPublicUrlForCdn(url) {
	const match = url.match(/https:\/\/(cdn|media)\.discordapp\.(?:com|net)\/attachments\/([0-9]+)\/([0-9]+)\/([-A-Za-z0-9_.,]+)/)
	if (!match) return url
	const unsignedHash = hasher.h64(match[3]) // attachment ID
	const signedHash = unsignedHash - 0x8000000000000000n // shifting down to signed 64-bit range
	db.prepare("INSERT OR IGNORE INTO media_proxy (permitted_hash) VALUES (?)").run(signedHash)
	return `${reg.ooye.bridge_origin}/download/discord${match[1]}/${match[2]}/${match[3]}/${match[4]}`
}

/**
 * @param {string} oldTimestamp
 * @param {string} newTimestamp
 * @returns {string} "a x-day-old unbridged message"
 */
function howOldUnbridgedMessage(oldTimestamp, newTimestamp) {
	const dateDifference = new Date(newTimestamp).getTime() - new Date(oldTimestamp).getTime()
	const oneHour = 60 * 60 * 1000
	if (dateDifference < oneHour) {
		return "an unbridged message"
	} else if (dateDifference < 25 * oneHour) {
		var dateDisplay = `a ${Math.floor(dateDifference / oneHour)}-hour-old unbridged message`
	} else {
		var dateDisplay = `a ${Math.round(dateDifference / (24 * oneHour))}-day-old unbridged message`
	}
	return dateDisplay
}

module.exports.getPermissions = getPermissions
module.exports.hasPermission = hasPermission
module.exports.hasSomePermissions = hasSomePermissions
module.exports.hasAllPermissions = hasAllPermissions
module.exports.isWebhookMessage = isWebhookMessage
module.exports.isEphemeralMessage = isEphemeralMessage
module.exports.snowflakeToTimestampExact = snowflakeToTimestampExact
module.exports.timestampToSnowflakeInexact = timestampToSnowflakeInexact
module.exports.getPublicUrlForCdn = getPublicUrlForCdn
module.exports.howOldUnbridgedMessage = howOldUnbridgedMessage
