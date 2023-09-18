// @ts-check

const assert = require("assert")

const passthrough = require("../../passthrough")
const {discord, sync, db, select} = passthrough
/** @type {import("../converters/thread-to-announcement")} */
const threadToAnnouncement = sync.require("../converters/thread-to-announcement")
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")

/**
 * @param {string} parentRoomID
 * @param {string} threadRoomID
 * @param {import("discord-api-types/v10").APIThreadChannel} thread
 */
async function announceThread(parentRoomID, threadRoomID, thread) {
	const creatorMxid = select("sim", "mxid", "WHERE discord_id = ?").pluck().get(thread.owner_id)

   const content = await threadToAnnouncement.threadToAnnouncement(parentRoomID, threadRoomID, creatorMxid, thread, {api})

	await api.sendEvent(parentRoomID, "m.room.message", content, creatorMxid)
}

module.exports.announceThread = announceThread
