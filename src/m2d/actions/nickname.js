// @ts-check

const {discord, db, select} = require("../../passthrough")

/** @param {string} guildID */
async function setNicknameFromGuildID(guildID) {
	const nicknamed = select("guild_space", "nicknamed", {guild_id: guildID}).pluck().get()
	if (nicknamed !== 0) return
	try {
		await discord.snow.guild.editGuildMember(guildID, "@me", {nick: "a Matrix user"})
		db.prepare("UPDATE guild_space SET nicknamed = 1 WHERE guild_id = ?").run(guildID)
	} catch (e) {
		console.error(e) // low priority failure should be logged instead of interrupting
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
