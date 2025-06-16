// @ts-check

const assert = require("assert").strict
const passthrough = require("../../passthrough")
const {discord, sync, db, select} = passthrough
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")

/**
 * @param {import("discord-api-types/v10").APIEmoji} emoji
 * @param {string} message_id
 * @returns {Promise<string>}
 */
async function emojiToKey(emoji, message_id) {
	let key
	if (emoji.id) {
		// Custom emoji
		const mxc = select("emoji", "mxc_url", {emoji_id: emoji.id}).pluck().get()
		if (mxc) {
			// The custom emoji is registered and we should send it
			key = mxc
		} else {
			// The custom emoji is not registered. We will register it and then add it.
			assert(emoji.name) // The docs say: "name may be null when custom emoji data is not available, for example, if it was deleted from the guild"
			const mxc = await file.uploadDiscordFileToMxc(file.emoji(emoji.id, emoji.animated))
			db.prepare("INSERT OR IGNORE INTO emoji (emoji_id, name, animated, mxc_url) VALUES (?, ?, ?, ?)").run(emoji.id, emoji.name, +!!emoji.animated, mxc)
			key = mxc
			// TODO: what happens if the matrix user also tries adding this reaction? the bridge bot isn't able to use that emoji...
		}
	} else {
		// Default emoji
		const name = emoji.name
		assert(name)
		// If the reaction was used on Matrix already, it might be using a different arrangement of Variation Selector 16 characters.
		// We'll use the same arrangement that was originally used, otherwise a duplicate of the emoji will appear as a separate reaction.
		const originalEncoding = select("reaction", "original_encoding", {message_id, encoded_emoji: encodeURIComponent(name)}).pluck().get()
		key = originalEncoding || name
	}
	return key
}

module.exports.emojiToKey = emojiToKey
