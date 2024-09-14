// @ts-check

const HeatSync = require("heatsync")
const sync = new HeatSync({watchFS: false})

const sqlite = require("better-sqlite3")
const db = new sqlite("db/ooye.db")

const passthrough = require("../src/passthrough")
Object.assign(passthrough, {db, sync})

const api = require("../src/matrix/api")
const mreq = require("../src/matrix/mreq")

const rooms = db.prepare("select room_id from channel_room").pluck().all()

;(async () => {
	// Step 5: Kick users starting with @_discord_
	await mreq.withAccessToken("baby", async () => {
		for (const roomID of rooms) {
			try {
				const members = await api.getJoinedMembers(roomID)
				for (const mxid of Object.keys(members.joined)) {
					if (mxid.startsWith("@_discord_") && !mxid.startsWith("@_discord_bot")) {
						await api.leaveRoom(roomID, mxid)
					}
				}
				await api.setUserPower(roomID, "@_discord_bot:cadence.moe", 0)
				await api.leaveRoom(roomID)
			} catch (e) {
				if (e.message.includes("Appservice not in room")) {
					// ok
				} else {
					throw e
				}
			}
		}
	})
})()
