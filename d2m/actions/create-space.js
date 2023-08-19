// @ts-check

const assert = require("assert")
const passthrough = require("../../passthrough")
const { sync, db } = passthrough
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")

/**
 * @param {import("discord-api-types/v10").RESTGetAPIGuildResult} guild
 */
async function createSpace(guild) {
	assert(guild.name)
	const roomID = await api.createRoom({
		name: guild.name,
		preset: "private_chat", // cannot join space unless invited
		visibility: "private",
		power_level_content_override: {
			events_default: 100, // space can only be managed by bridge
			invite: 0 // any existing member can invite others
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
					guest_access: "can_join" // guests can join space if other conditions are met
				}
			},
			{
				type: "m.room.history_visibility",
				content: {
					history_visibility: "invited" // any events sent after user was invited are visible
				}
			}
		]
	})
	db.prepare("INSERT INTO guild_space (guild_id, space_id) VALUES (?, ?)").run(guild.id, roomID)
	return roomID
}

module.exports.createSpace = createSpace
