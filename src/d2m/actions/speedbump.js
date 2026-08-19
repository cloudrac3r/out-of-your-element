// @ts-check

const DiscordTypes = require("discord-api-types/v10")

const passthrough = require("../../passthrough")
const {discord, from, select, db, sync} = passthrough

const {reg} = require("../../matrix/read-registration")
/** @type {import("./register-pk-user")} */
const registerPkUser = sync.require("./register-pk-user")
/** @type {import("./register-plu-ral-user")} */
const registerPluRalUser = sync.require("./register-plu-ral-user")
/** @type {import("./register-webhook-user")} */
const registerWebhookUser = sync.require("./register-webhook-user")

const DEBUG_SPEEDBUMP = false

function debugSpeedbump(...args) {
	if (DEBUG_SPEEDBUMP) {
		console.log(...args)
	}
}

const SPEEDBUMP_SPEED = 4000 // 4 seconds delay
const SPEEDBUMP_UPDATE_FREQUENCY = 2 * 60 * 60 // 2 hours

/** @type {Set<any>} */
const KNOWN_BOTS = new Set([
	"466378653216014359", // PluralKit
	"1291501048493768784", // /plu/ral
])

/**
 * Fetch new speedbump data for the channel and put it in the database as cache
 * @param {string} channelID
 * @param {number?} lastChecked
 */
async function updateCache(channelID, lastChecked) {
	const now = Math.floor(Date.now() / 1000)
	if (lastChecked && now - lastChecked < SPEEDBUMP_UPDATE_FREQUENCY) return
	const webhooks = await discord.snow.webhook.getChannelWebhooks(channelID)
	const found = webhooks.filter(b => KNOWN_BOTS.has(b.application_id))
	db.transaction(() => {
		db.prepare("DELETE FROM channel_speedbump WHERE channel_id = ?").run(channelID)
		for (const webhook of found) {
			db.prepare("INSERT INTO channel_speedbump (channel_id, speedbump_webhook_id, speedbump_user_id) VALUES (?, ?, ?)").run(channelID, webhook.id, webhook.application_id)
		}
		db.prepare("UPDATE channel_room SET speedbump_checked = ? WHERE channel_id = ?").run(now, channelID)
	})()
}

/**
 * @typedef BumpingEntry
 * @prop {number} number number of gateway events currently bumping for this message ID
 * @prop {boolean} hasCreate whether there was a message create within the events currently bumping
 */

/** @type {Map<string, BumpingEntry>} messageID -> BumpingEntry */
const bumping = new Map()

/**
 * Slow down a message. After it passes the speedbump, return whether it's okay or if it's been deleted.
 * @param {boolean} isCreate
 * @param {string} messageID
 * @returns whether it was deleted
 */
async function doSpeedbump(isCreate, messageID) {
	const entry = bumping.get(messageID) ?? (() => {
		const entry = {number: 0, hasCreate: false}
		bumping.set(messageID, entry)
		return entry
	})()

	entry.number++
	entry.hasCreate ||= isCreate

	debugSpeedbump(`[speedbump] WAIT ${messageID}++ =`, entry)

	await new Promise(resolve => setTimeout(resolve, SPEEDBUMP_SPEED))

	if (!bumping.has(messageID)) {
		debugSpeedbump(`[speedbump] DELETED ${messageID}`)
		return {skip: true, hasCreate: null}
	}

	if (--entry.number <= 0) {
		debugSpeedbump(`[speedbump] OK ${messageID}-- =`, entry)
		bumping.delete(messageID)
		return {skip: false, hasCreate: entry.hasCreate}
	} else {
		debugSpeedbump(`[speedbump] MULTI ${messageID}-- =`, entry)
		return {skip: true, hasCreate: null}
	}
}

function getSpeedbumpRows(channelID) {
	return from("channel_room").join("channel_speedbump", "channel_id").select("thread_parent", "speedbump_user_id", "speedbump_webhook_id").where({channel_id: channelID}).all()
}

/**
 * Check whether to slow down a message, and do it. After it passes the speedbump, return whether it's okay or if it's been deleted.
 * @param {boolean} isCreate
 * @param {{id: string, channel_id: string, author: {id: string}, backfill?: boolean}} message uses the ID to identify, and the userID to only slow down the message when the user has used PK before
 * @returns whether to skip this message, and whether the message should be created as a creation
 */
async function maybeDoSpeedbump(isCreate, message) {
	let rows = getSpeedbumpRows(message.channel_id)
	if (rows[0]?.thread_parent) rows = getSpeedbumpRows(rows[0].thread_parent) // webhooks belong to the channel, not the thread
	if (!rows.length) return {skip: false} // channel not affected, no speedbump

	if (message.backfill) return {skip: false} // don't slow messages during backfill
	if (rows.some(r => r.speedbump_webhook_id === message.author.id)) return {skip: false} // shortcut
	const userHasProxy = select("sim_proxy", "user_id", {proxy_owner_id: message.author.id}).pluck().get()
	if (!userHasProxy) return {skip: false} // user has not used PK before, no speedbump
	const {skip, hasCreate} = await doSpeedbump(isCreate, message.id)
	return {skip, hasCreate} // maybe affected, and there is a speedbump
}

/**
 * @param {string} messageID
 */
function onMessageDelete(messageID) {
	bumping.delete(messageID)
}

/**
 * @param {DiscordTypes.APIMessage} message
 * @param {string} guildID
 * @param {string} roomID
 */
async function getWebhookSenderId(message, guildID, roomID) {
	const isMatrixWebhook = select("webhook", "webhook_id", {webhook_id: message.webhook_id}).pluck().get()
	if (isMatrixWebhook) return null
	const speedbumpUserID = select("channel_speedbump", "speedbump_user_id", {channel_id: message.channel_id, speedbump_webhook_id: message.webhook_id}).pluck().get()
	const useWebhookProfile = select("guild_space", "webhook_profile", {guild_id: guildID}).pluck().get() ?? 0
	if (speedbumpUserID === "466378653216014359") { // PluralKit public instance
		return await registerPkUser.syncUser(message.id, message.author, roomID, true)
	} else if (speedbumpUserID === "1291501048493768784" && reg.ooye.plu_ral_api_key) { // /plu/ral public instance
		return await registerPluRalUser.syncUser(message.channel_id, message.id, message.author, roomID, true)
	} else if (useWebhookProfile) {
		return await registerWebhookUser.syncUser(message.author, roomID, true)
	}
	return null
}

module.exports.updateCache = updateCache
module.exports.maybeDoSpeedbump = maybeDoSpeedbump
module.exports.onMessageDelete = onMessageDelete
module.exports.getWebhookSenderId = getWebhookSenderId
