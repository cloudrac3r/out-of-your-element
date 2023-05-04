// @ts-check

const passthrough = require("../../passthrough")
const { sync, db } = passthrough
/** @type {import("../../matrix/mreq")} */
const mreq = sync.require("../../matrix/mreq")

/**
 * @param {import("discord-api-types/v10").RESTGetAPIGuildResult} guild
 */
function createSpace(guild) {
	return mreq.mreq("POST", "/client/v3/createRoom", {
		name: guild.name,
		preset: "private_chat",
		visibility: "private",
		power_level_content_override: {
			events_default: 100,
			invite: 50
		},
		invite: ["@cadence:cadence.moe"], // TODO
		topic: guild.description || undefined,
		creation_content: {
			type: "m.space"
		},
		initial_state: [
			{
				type: "m.room.guest_access",
				state_key: "",
				content: {
					guest_access: "can_join"
				}
			},
			{
				type: "m.room.history_visibility",
				content: {
					history_visibility: "invited"
				}
			}
		]
	}).then(/** @param {import("../../types").R_RoomCreated} root */ root => {
		db.prepare("INSERT INTO guild_space (guild_id, space_id) VALUES (?, ?)").run(guild.id, root.room_id)
		return root
	})
}

module.exports.createSpace = createSpace
