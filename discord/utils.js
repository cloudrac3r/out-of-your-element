// @ts-check

const DiscordTypes = require("discord-api-types/v10")

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
		/** @type {((overwrite: Required<DiscordTypes.APIGuildChannel>["permission_overwrites"][0]) => any)[]} */
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
 * Command interaction responses have a webhook_id for some reason, but still have real author info of a real bot user in the server.
 * @param {DiscordTypes.APIMessage} message
 */
function isWebhookMessage(message) {
	const isInteractionResponse = message.type === 20
	return message.webhook_id && !isInteractionResponse
}

/** @param {string} snowflake */
function snowflakeToTimestampExact(snowflake) {
	return Number(BigInt(snowflake) >> 22n) + EPOCH
}

/** @param {number} timestamp */
function timestampToSnowflakeInexact(timestamp) {
	return String((timestamp - EPOCH) * 2**22)
}

module.exports.getPermissions = getPermissions
module.exports.isWebhookMessage = isWebhookMessage
module.exports.snowflakeToTimestampExact = snowflakeToTimestampExact
module.exports.timestampToSnowflakeInexact = timestampToSnowflakeInexact
