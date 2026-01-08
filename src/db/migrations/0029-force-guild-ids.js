/*
	a. If the bridge bot sim already has the correct ID:
		- No rows updated.

	b. If the bridge bot sim has the wrong ID but there's no duplicate:
		- One row updated.

	c. If the bridge bot sim has the wrong ID and there's a duplicate:
		- One row updated (replaces an existing row).
*/

const {discord} = require("../../passthrough")

const ones = "₀₁₂₃₄₅₆₇₈₉"
const tens = "0123456789"

/* c8 ignore start */

module.exports = async function(db) {
	/** @type {{name: string, channel_id: string, thread_parent: string | null}[]} */
	const rows = db.prepare("SELECT name, channel_id, thread_parent FROM channel_room WHERE guild_id IS NULL").all()

	/** @type {Map<string, string>} channel or thread ID -> guild ID */
	const cache = new Map()

	// Process channels
	process.stdout.write(`  loading metadata for ${rows.length} channels/threads... `)
	for (let counter = 1; counter <= rows.length; counter++) {
		process.stdout.write(String(counter).at(-1) === "0" ? tens[(counter/10)%10] : ones[counter%10])
		const row = rows[counter-1]
		const id = row.thread_parent || row.channel_id
		if (cache.has(id)) continue

		try {
			var channel = await discord.snow.channel.getChannel(id)
		} catch (e) {
			continue
		}

		const guildID = channel.guild_id
		const channels = await discord.snow.guild.getGuildChannels(guildID)
		for (const channel of channels) {
			cache.set(channel.id, guildID)
		}
	}

	// Update channels and threads
	process.stdout.write("\n")
	db.transaction(() => {
		// Fill in missing data
		for (const row of rows) {
			const guildID = cache.get(row.thread_parent) || cache.get(row.channel_id)
			if (guildID) {
				db.prepare("UPDATE channel_room SET guild_id = ? WHERE channel_id = ?").run(guildID, row.channel_id)
			} else {
				db.prepare("DELETE FROM webhook WHERE channel_id = ?").run(row.channel_id)
				db.prepare("DELETE FROM channel_room WHERE channel_id = ?").run(row.channel_id)
			}
		}
	})()
}
