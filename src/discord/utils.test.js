const DiscordTypes = require("discord-api-types/v10")
const {test} = require("supertape")
const data = require("../../test/data")
const utils = require("./utils")

test("is webhook message: identifies bot interaction response as not a message", t => {
	t.equal(utils.isWebhookMessage(data.interaction_message.thinking_interaction), false)
})

test("is webhook message: identifies webhook interaction response as not a message", t => {
	t.equal(utils.isWebhookMessage(data.interaction_message.thinking_interaction_without_bot_user), false)
})

test("is webhook message: identifies webhook message as a message", t => {
	t.equal(utils.isWebhookMessage(data.special_message.bridge_echo_webhook), true)
})

test("discord utils: converts snowflake to timestamp", t => {
	t.equal(utils.snowflakeToTimestampExact("86913608335773696"), 1440792219004)
})

test("discord utils: converts timestamp to snowflake", t => {
	t.match(utils.timestampToSnowflakeInexact(1440792219004), /^869136083357.....$/)
})

test("getPermissions: channel overwrite to allow role works", t => {
	const guildRoles = [
		{
			version: 1695412489043,
			unicode_emoji: null,
			tags: {},
			position: 0,
			permissions: "559623605571137",
			name: "@everyone",
			mentionable: false,
			managed: false,
			id: "1154868424724463687",
			icon: null,
			hoist: false,
			flags: 0,
			color: 0
		},
		{
			version: 1695412604262,
			unicode_emoji: null,
			tags: { bot_id: "466378653216014359" },
			position: 1,
			permissions: "536995904",
			name: "PluralKit",
			mentionable: false,
			managed: true,
			id: "1154868908336099444",
			icon: null,
			hoist: false,
			flags: 0,
			color: 0
		},
		{
			version: 1698778936921,
			unicode_emoji: null,
			tags: {},
			position: 1,
			permissions: "536870912",
			name: "web hookers",
			mentionable: false,
			managed: false,
			id: "1168988246680801360",
			icon: null,
			hoist: false,
			flags: 0,
			color: 0
		}
	]
	const userRoles = [ "1168988246680801360" ]
	const userID = "684280192553844747"
	const overwrites = [
		{ type: 0, id: "1154868908336099444", deny: "0", allow: "1024" },
		{ type: 0, id: "1154868424724463687", deny: "1024", allow: "0" },
		{ type: 0, id: "1168988246680801360", deny: "0", allow: "1024" },
		{ type: 1, id: "353373325575323648", deny: "0", allow: "1024" }
	]
	const permissions = utils.getPermissions(userRoles, guildRoles, userID, overwrites)
	const want = BigInt(1 << 10 | 1 << 16)
	t.equal((permissions & want), want)
})

test("getPermissions: channel overwrite to allow user works", t => {
	const guildRoles = [
		{
			version: 1695412489043,
			unicode_emoji: null,
			tags: {},
			position: 0,
			permissions: "559623605571137",
			name: "@everyone",
			mentionable: false,
			managed: false,
			id: "1154868424724463687",
			icon: null,
			hoist: false,
			flags: 0,
			color: 0
		},
		{
			version: 1695412604262,
			unicode_emoji: null,
			tags: { bot_id: "466378653216014359" },
			position: 1,
			permissions: "536995904",
			name: "PluralKit",
			mentionable: false,
			managed: true,
			id: "1154868908336099444",
			icon: null,
			hoist: false,
			flags: 0,
			color: 0
		},
		{
			version: 1698778936921,
			unicode_emoji: null,
			tags: {},
			position: 1,
			permissions: "536870912",
			name: "web hookers",
			mentionable: false,
			managed: false,
			id: "1168988246680801360",
			icon: null,
			hoist: false,
			flags: 0,
			color: 0
		}
	]
	const userRoles = []
	const userID = "353373325575323648"
	const overwrites = [
		{ type: 0, id: "1154868908336099444", deny: "0", allow: "1024" },
		{ type: 0, id: "1154868424724463687", deny: "1024", allow: "0" },
		{ type: 0, id: "1168988246680801360", deny: "0", allow: "1024" },
		{ type: 1, id: "353373325575323648", deny: "0", allow: "1024" }
	]
	const permissions = utils.getPermissions(userRoles, guildRoles, userID, overwrites)
	const want = BigInt(1 << 10 | 1 << 16)
	t.equal((permissions & want), want)
})

test("hasSomePermissions: detects the permission", t => {
	const userPermissions = DiscordTypes.PermissionFlagsBits.MentionEveryone | DiscordTypes.PermissionFlagsBits.BanMembers
	const canRemoveMembers = utils.hasSomePermissions(userPermissions, ["KickMembers", "BanMembers"])
	t.equal(canRemoveMembers, true)
})

test("hasSomePermissions: doesn't detect not the permission", t => {
	const userPermissions = DiscordTypes.PermissionFlagsBits.MentionEveryone | DiscordTypes.PermissionFlagsBits.SendMessages
	const canRemoveMembers = utils.hasSomePermissions(userPermissions, ["KickMembers", "BanMembers"])
	t.equal(canRemoveMembers, false)
})

test("hasAllPermissions: detects the permissions", t => {
	const userPermissions = DiscordTypes.PermissionFlagsBits.KickMembers | DiscordTypes.PermissionFlagsBits.BanMembers | DiscordTypes.PermissionFlagsBits.MentionEveryone
	const canRemoveMembers = utils.hasAllPermissions(userPermissions, ["KickMembers", "BanMembers"])
	t.equal(canRemoveMembers, true)
})

test("hasAllPermissions: doesn't detect not the permissions", t => {
	const userPermissions = DiscordTypes.PermissionFlagsBits.MentionEveryone | DiscordTypes.PermissionFlagsBits.SendMessages | DiscordTypes.PermissionFlagsBits.KickMembers
	const canRemoveMembers = utils.hasAllPermissions(userPermissions, ["KickMembers", "BanMembers"])
	t.equal(canRemoveMembers, false)
})

test("isEphemeralMessage: detects ephemeral message", t => {
	t.equal(utils.isEphemeralMessage(data.special_message.ephemeral_message), true)
})

test("isEphemeralMessage: doesn't detect normal message", t => {
	t.equal(utils.isEphemeralMessage(data.message.simple_plaintext), false)
})

test("getPublicUrlForCdn: no-op on non-discord URL", t => {
	t.equal(utils.getPublicUrlForCdn("https://cadence.moe"), "https://cadence.moe")
})
