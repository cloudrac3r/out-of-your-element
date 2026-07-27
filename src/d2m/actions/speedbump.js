// @ts-check

const passthrough = require("../../passthrough")
const {discord, select, db} = passthrough

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
	"466378653216014359" // PluralKit
])

const CONTEXT_ENUM = {
	create: "create",
	update: "update"
}

/**
 * Fetch new speedbump data for the channel and put it in the database as cache
 * @param {string} channelID
 * @param {number?} lastChecked
 */
async function updateCache(channelID, lastChecked) {
	const now = Math.floor(Date.now() / 1000)
	if (lastChecked && now - lastChecked < SPEEDBUMP_UPDATE_FREQUENCY) return
	const webhooks = await discord.snow.webhook.getChannelWebhooks(channelID)
	const found = webhooks.find(b => KNOWN_BOTS.has(b.application_id))
	const foundApplication = found?.application_id
	const foundWebhook = found?.id
	db.prepare("UPDATE channel_room SET speedbump_id = ?, speedbump_webhook_id = ?, speedbump_checked = ? WHERE channel_id = ?").run(foundApplication, foundWebhook, now, channelID)
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
 * @param {keyof typeof CONTEXT_ENUM} context
 * @param {string} messageID
 * @returns whether it was deleted
 */
async function doSpeedbump(context, messageID) {
	const entry = bumping.get(messageID) ?? (() => {
		const entry = {number: 0, hasCreate: false}
		bumping.set(messageID, entry)
		return entry
	})()

	entry.number++
	if (context === "create") entry.hasCreate = true

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

/**
 * Check whether to slow down a message, and do it. After it passes the speedbump, return whether it's okay or if it's been deleted.
 * @param {keyof typeof CONTEXT_ENUM} context
 * @param {{id: string, channel_id: string, author: {id: string}, backfill?: boolean}} message uses the ID to identify, and the userID to only slow down the message when the user has used PK before
 * @returns whether it was deleted, and data about the channel's (not thread's) speedbump
 */
async function maybeDoSpeedbump(context, message) {
	let row = select("channel_room", ["room_id", "thread_parent", "speedbump_id", "speedbump_webhook_id"], {channel_id: message.channel_id}).get()
	if (row?.thread_parent) row = select("channel_room", ["room_id", "thread_parent", "speedbump_id", "speedbump_webhook_id"], {channel_id: row.thread_parent}).get() // webhooks belong to the channel, not the thread
	if (!row?.speedbump_webhook_id || !row?.speedbump_id) return {skip: false, proxyWebhook: null} // channel not affected, no speedbump

	let proxyWebhook = {userID: row.speedbump_id, webhookID: row.speedbump_webhook_id}
	if (message.backfill) return {skip: false, proxyWebhook} // don't slow messages during backfill
	if (proxyWebhook.webhookID === message.author.id) return {skip: false, proxyWebhook} // shortcut
	const userHasProxy = select("sim_proxy", "user_id", {proxy_owner_id: message.author.id}).pluck().get()
	if (!userHasProxy) return {skip: false, proxyWebhook} // user has not used PK before, no speedbump
	const {skip, hasCreate} = await doSpeedbump(context, message.id)
	return {skip, hasCreate, proxyWebhook} // maybe affected, and there is a speedbump
}

/**
 * @param {string} messageID
 */
function onMessageDelete(messageID) {
	bumping.delete(messageID)
}

module.exports.updateCache = updateCache
module.exports.doSpeedbump = doSpeedbump
module.exports.maybeDoSpeedbump = maybeDoSpeedbump
module.exports.onMessageDelete = onMessageDelete
