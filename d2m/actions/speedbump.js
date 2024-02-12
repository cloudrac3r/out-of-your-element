// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const passthrough = require("../../passthrough")
const {discord, select, db} = passthrough

const SPEEDBUMP_SPEED = 4000 // 4 seconds delay
const SPEEDBUMP_UPDATE_FREQUENCY = 2 * 60 * 60 // 2 hours

/** @type {Set<any>} */
const KNOWN_BOTS = new Set([
	"466378653216014359" // PluralKit
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
	const found = webhooks.find(b => KNOWN_BOTS.has(b.application_id))
	const foundApplication = found?.application_id
	const foundWebhook = found?.id
	db.prepare("UPDATE channel_room SET speedbump_id = ?, speedbump_webhook_id = ?, speedbump_checked = ? WHERE channel_id = ?").run(foundApplication, foundWebhook, now, channelID)
}

/** @type {Set<string>} set of messageID */
const bumping = new Set()

/**
 * Slow down a message. After it passes the speedbump, return whether it's okay or if it's been deleted.
 * @param {string} messageID
 * @returns whether it was deleted
 */
async function doSpeedbump(messageID) {
	bumping.add(messageID)
	await new Promise(resolve => setTimeout(resolve, SPEEDBUMP_SPEED))
	return !bumping.delete(messageID)
}

/**
 * Check whether to slow down a message, and do it. After it passes the speedbump, return whether it's okay or if it's been deleted.
 * @param {string} channelID
 * @param {string} messageID
 * @returns whether it was deleted, and data about the channel's (not thread's) speedbump
 */
async function maybeDoSpeedbump(channelID, messageID) {
	let row = select("channel_room", ["thread_parent", "speedbump_id", "speedbump_webhook_id"], {channel_id: channelID}).get()
	if (row?.thread_parent) row = select("channel_room", ["thread_parent", "speedbump_id", "speedbump_webhook_id"], {channel_id: row.thread_parent}).get() // webhooks belong to the channel, not the thread
	if (!row?.speedbump_webhook_id) return {affected: false, row: null} // not affected, no speedbump
	const affected = await doSpeedbump(messageID)
	return {affected, row} // maybe affected, and there is a speedbump
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
