// @ts-check

const assert = require("assert")

const passthrough = require("../../passthrough")
const {discord, sync, db, select} = passthrough
/** @type {import("../converters/thread-to-announcement")} */
const threadToAnnouncement = sync.require("../converters/thread-to-announcement")
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("./register-user")} */
const registerUser = sync.require("./register-user")

/**
 * @param {string} parentRoomID
 * @param {string} threadRoomID
 * @param {import("discord-api-types/v10").APIThreadChannel} thread
 */
async function announceThread(parentRoomID, threadRoomID, thread) {
	assert(thread.owner_id)
	// @ts-ignore
	const creatorMxid = await registerUser.ensureSimJoined({id: thread.owner_id}, parentRoomID)
	const content = await threadToAnnouncement.threadToAnnouncement(parentRoomID, threadRoomID, creatorMxid, thread, {api})
	await api.sendEvent(parentRoomID, "m.room.message", content, creatorMxid)
}

module.exports.announceThread = announceThread
