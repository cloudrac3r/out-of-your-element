// @ts-check

const assert = require("assert/strict")
const Ty = require("../types")
const {Semaphore} = require("@chriscdn/promise-semaphore")
const {tag} = require("@cloudrac3r/html-template-tag")
const {discord, db, sync, as, select, from} = require("../passthrough")

/** @type {import("./api")}) */
const api = sync.require("./api")
/** @type {import("../d2m/actions/create-room")}) */
const createRoom = sync.require("../d2m/actions/create-room")
/** @type {import("../m2d/converters/utils")}) */
const utils = sync.require("../m2d/converters/utils")

const roomUpgradeSema = new Semaphore()

/**
 * @param {Ty.Event.StateOuter<Ty.Event.M_Room_Tombstone>} event
 */
async function onTombstone(event) {
	// Validate
	if (event.state_key !== "") return
	if (!event.content.replacement_room) return

	// Set up
	const oldRoomID = event.room_id
	const newRoomID = event.content.replacement_room
	const channel = select("channel_room", ["name", "channel_id"], {room_id: oldRoomID}).get()
	if (!channel) return
	db.prepare("REPLACE INTO room_upgrade_pending (new_room_id, old_room_id) VALUES (?, ?)").run(newRoomID, oldRoomID)

	// Try joining
	try {
		await api.joinRoom(newRoomID)
	} catch (e) {
		const message = new utils.MatrixStringBuilder()
		message.add(
			`You upgraded the bridged room ${channel.name}. To keep bridging, I need you to invite me to the new room: https://matrix.to/#/${newRoomID}`,
			tag`You upgraded the bridged room <strong>${channel.name}</strong>. To keep bridging, I need you to invite me to the new room: <a href="https://matrix.to/#/${newRoomID}">https://matrix.to/#/${newRoomID}</a>`
		)
		const privateRoomID = await api.usePrivateChat(event.sender)
		await api.sendEvent(privateRoomID, "m.room.message", message.get())
	}

	// Now wait to be invited to/join the room that has the upgrade pending...
}

/**
 * @param {Ty.Event.StateOuter<Ty.Event.M_Room_Member>} event
 * @returns {Promise<boolean>} whether to cancel other membership actions
 */
async function onBotMembership(event) {
	// Check if an upgrade is pending for this room
	const newRoomID = event.room_id
	const oldRoomID = select("room_upgrade_pending", "old_room_id", {new_room_id: newRoomID}).pluck().get()
	if (!oldRoomID) return

	// Check if is join/invite
	if (event.content.membership !== "invite" && event.content.membership !== "join") return

	return await roomUpgradeSema.request(async () => {
		// If invited, join
		if (event.content.membership === "invite") {
			await api.joinRoom(newRoomID)
		}

		const channelRow = from("channel_room").join("guild_space", "guild_id").where({room_id: oldRoomID}).select("space_id", "guild_id", "channel_id").get()
		assert(channelRow)

		// Remove old room from space
		await api.sendState(channelRow.space_id, "m.space.child", oldRoomID, {})
		// await api.sendState(oldRoomID, "m.space.parent", spaceID, {}) // keep this - the room isn't advertised but should still be grouped if opened

		// Remove declaration that old room is bridged (if able)
		try {
			await api.sendState(oldRoomID, "uk.half-shot.bridge", `moe.cadence.ooye://discord/${channelRow.guild_id}/${channelRow.channel_id}`, {})
		} catch (e) {}

		// Update database
		db.transaction(() => {
			db.prepare("DELETE FROM room_upgrade_pending WHERE new_room_id = ?").run(newRoomID)
			db.prepare("UPDATE channel_room SET room_id = ? WHERE channel_id = ?").run(newRoomID, channelRow.channel_id)
			db.prepare("INSERT INTO historical_channel_room (room_id, reference_channel_id, upgraded_timestamp) VALUES (?, ?, ?)").run(newRoomID, channelRow.channel_id, Date.now())
		})()

		// Sync
		await createRoom.syncRoom(channelRow.channel_id)
		return true
	}, event.room_id)
}

module.exports.onTombstone = onTombstone
module.exports.onBotMembership = onBotMembership
