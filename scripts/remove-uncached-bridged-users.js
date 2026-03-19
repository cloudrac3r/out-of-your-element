// @ts-check

const HeatSync = require("heatsync")
const sync = new HeatSync({watchFS: false})

const sqlite = require("better-sqlite3")
const db = new sqlite("ooye.db", {fileMustExist: true})

const passthrough = require("../src/passthrough")
Object.assign(passthrough, {db, sync})

const api = require("../src/matrix/api")
const utils = require("../src/matrix/utils")
const {reg} = require("../src/matrix/read-registration")

const rooms = db.prepare("select room_id, name, nick from channel_room").all()

;(async () => {
	// Search for members starting with @_ooye_ and kick them if they are not in sim_member cache
	for (const room of rooms) {
		try {
			const members = await api.getJoinedMembers(room.room_id)
			for (const mxid of Object.keys(members.joined)) {
				if (!mxid.startsWith("@" + reg.sender_localpart) && utils.eventSenderIsFromDiscord(mxid) && !db.prepare("select mxid from sim_member where mxid = ? and room_id = ?").get(mxid, room.room_id)) {
					await api.leaveRoom(room.room_id, mxid)
				}
			}
		} catch (e) {
			if (e.message.includes("Appservice not in room")) {
				// ok
			} else {
				throw e
			}
		}
	}
})()
