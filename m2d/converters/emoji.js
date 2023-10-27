// @ts-check

const assert = require("assert").strict
const Ty = require("../../types")

const passthrough = require("../../passthrough")
const {sync, select} = passthrough

/**
 * @param {string} input
 * @param {string | null | undefined} shortcode
 * @returns {string?}
 */
function encodeEmoji(input, shortcode) {
	let discordPreferredEncoding
	if (input.startsWith("mxc://")) {
		// Custom emoji
		let row = select("emoji", ["emoji_id", "name"], {mxc_url: input}).get()
		if (!row && shortcode) {
			// Use the name to try to find a known emoji with the same name.
			const name = shortcode.replace(/^:|:$/g, "")
			row = select("emoji", ["emoji_id", "name"], {name: name}).get()
		}
		if (!row) {
			// We don't have this emoji and there's no realistic way to just-in-time upload a new emoji somewhere.
			// Sucks!
			return null
		}
		// Cool, we got an exact or a candidate emoji.
		discordPreferredEncoding = encodeURIComponent(`${row.name}:${row.emoji_id}`)
	} else {
		// Default emoji
		// https://github.com/discord/discord-api-docs/issues/2723#issuecomment-807022205 ????????????
		const encoded = encodeURIComponent(input)
		const encodedTrimmed = encoded.replace(/%EF%B8%8F/g, "")

		const forceTrimmedList = [
			"%F0%9F%91%8D", // 👍
			"%F0%9F%91%8E", // 👎️
			"%E2%AD%90", // ⭐
			"%F0%9F%90%88", // 🐈
			"%E2%9D%93", // ❓
			"%F0%9F%8F%86", // 🏆️
		]

		discordPreferredEncoding =
			( forceTrimmedList.includes(encodedTrimmed) ? encodedTrimmed
			: encodedTrimmed !== encoded && [...input].length === 2 ? encoded
			: encodedTrimmed)

		console.log("add reaction from matrix:", input, encoded, encodedTrimmed, "chosen:", discordPreferredEncoding)
	}
	return discordPreferredEncoding
}

module.exports.encodeEmoji = encodeEmoji
