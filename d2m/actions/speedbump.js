// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const passthrough = require("../../passthrough")
const {discord, db} = passthrough

const SPEEDBUMP_SPEED = 4000 // 4 seconds delay
const SPEEDBUMP_UPDATE_FREQUENCY = 2 * 60 * 60 // 2 hours

/** @type {Set<any>} */
const KNOWN_BOTS = new Set([
	"466378653216014359" // PluralKit
])

/**
 * Fetch new speedbump data for the channel and put it in the database as cache
 * @param {string} channelID
 * @param {string?} speedbumpID
 * @param {number?} speedbumpChecked
 */
async function updateCache(channelID, speedbumpID, speedbumpChecked) {
	const now = Math.floor(Date.now() / 1000)
	if (speedbumpChecked && now - speedbumpChecked < SPEEDBUMP_UPDATE_FREQUENCY) return
	const webhooks = await discord.snow.webhook.getChannelWebhooks(channelID)
	const found = webhooks.find(b => KNOWN_BOTS.has(b.application_id))?.application_id || null
	db.prepare("UPDATE channel_room SET speedbump_id = ?, speedbump_checked = ? WHERE channel_id = ?").run(found, now, channelID)
}

/** @type {Set<string>} set of messageID */
const bumping = new Set()

/**
 * Slow down a message. After it passes the speedbump, return whether it's okay or if it's been deleted.
 * @param {string} messageID
 */
async function doSpeedbump(messageID) {
	bumping.add(messageID)
	await new Promise(resolve => setTimeout(resolve, SPEEDBUMP_SPEED))
	return !bumping.delete(messageID)
}

/**
 * @param {string} messageID
 */
function onMessageDelete(messageID) {
	bumping.delete(messageID)
}

module.exports.updateCache = updateCache
module.exports.doSpeedbump = doSpeedbump
module.exports.onMessageDelete = onMessageDelete
