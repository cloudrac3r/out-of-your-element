// @ts-check

const {discord, db, select, sync} = require("../../passthrough")

const guildNicknamedCache = sync.remember(() => new Set())

/** @param {string} guildID */
function markGuildNicknamed(guildID) {
	db.prepare("UPDATE guild_space SET nicknamed = 1 WHERE guild_id = ?").run(guildID)
	guildNicknamedCache.add(guildID)
}

/** @param {string} guildID */
async function setNicknameFromGuildID(guildID) {
	// Check if nickname is already set via cache
	if (guildNicknamedCache.has(guildID)) return

	// Check if nickname is already set via DB (and update cache if so)
	const nicknamed = select("guild_space", "nicknamed", {guild_id: guildID}).pluck().get()
	if (nicknamed !== 0) {
		guildNicknamedCache.add(guildID)
		return
	}

	// Hasn't been done yet. Apply nickname now
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
