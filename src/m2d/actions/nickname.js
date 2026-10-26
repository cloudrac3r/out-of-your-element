// @ts-check

const {discord, db, select} = require("../../passthrough")

/** @param {string} guildID */
function markGuildNicknamed(guildID) {
	db.prepare("UPDATE guild_space SET nicknamed = 1 WHERE guild_id = ?").run(guildID)
}

/** @param {string} guildID */
async function setNicknameFromGuildID(guildID) {
	const nicknamed = select("guild_space", "nicknamed", {guild_id: guildID}).pluck().get()
	if (nicknamed !== 0) return
	try {
		await discord.snow.guild.editGuildMember(guildID, "@me", {nick: "a Matrix user"})
		markGuildNicknamed(guildID)
	} catch (e) {
		if (e.message === "Missing Permissions") {
			markGuildNicknamed(guildID) // skip this guild and don't try again
		} else {
			console.error(e) // low priority failure should be logged instead of interrupting
		}
	}
}

/** @param {string} roomID */
async function setNicknameFromRoomID(roomID) {
	const guildID = select("channel_room", "guild_id", {room_id: roomID}).pluck().get()
	if (!guildID) return
	setNicknameFromGuildID(guildID)
}

module.exports.setNicknameFromGuildID = setNicknameFromGuildID
module.exports.setNicknameFromRoomID = setNicknameFromRoomID
