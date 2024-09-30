const {test} = require("supertape")
const DiscordTypes = require("discord-api-types/v10")
const {select, db} = require("../../passthrough")
const {_interact} = require("./privacy")

/**
 * @template T
 * @param {AsyncIterable<T>} ai
 * @returns {Promise<T[]>}
 */
async function fromAsync(ai) {
	const result = []
	for await (const value of ai) {
		result.push(value)
	}
	return result
}

test("privacy: checks if guild is bridged", async t => {
	const msgs = await fromAsync(_interact({
		data: {
			options: []
		},
		guild_id: "0"
	}, {}))
	t.equal(msgs.length, 1)
	t.equal(msgs[0].createInteractionResponse.data.content, "This server isn't bridged to Matrix, so you can't set the Matrix privacy level.")
})

test("privacy: reports usage if there is no parameter", async t => {
	const msgs = await fromAsync(_interact({
		data: {
			options: []
		},
		guild_id: "112760669178241024"
	}, {}))
	t.equal(msgs.length, 1)
	t.match(msgs[0].createInteractionResponse.data.content, /Usage: `\/privacy/)
})

test("privacy: reports usage for invalid parameter", async t => {
	const msgs = await fromAsync(_interact({
		data: {
			options: [
				{
					name: "level",
					type: DiscordTypes.ApplicationCommandOptionType.String,
					value: "info"
				}
			]
		},
		guild_id: "112760669178241024"
	}, {}))
	t.equal(msgs.length, 1)
	t.match(msgs[0].createInteractionResponse.data.content, /Usage: `\/privacy/)
})

test("privacy: updates setting and calls syncSpace for valid parameter", async t => {
	let called = 0
	const msgs = await fromAsync(_interact({
		data: {
			options: [
				{
					name: "level",
					type: DiscordTypes.ApplicationCommandOptionType.String,
					value: "directory"
				}
			]
		},
		guild_id: "112760669178241024"
	}, {
		createSpace: {
			async syncSpaceFully(guildID) {
				called++
				t.equal(guildID, "112760669178241024")
			}
		}
	}))
	t.equal(msgs.length, 2)
	t.equal(msgs[0].createInteractionResponse.type, DiscordTypes.InteractionResponseType.DeferredChannelMessageWithSource)
	t.equal(msgs[1].editOriginalInteractionResponse.content, "Privacy level updated to `directory`.")
	t.equal(called, 1)
	t.equal(select("guild_space", "privacy_level", {guild_id: "112760669178241024"}).pluck().get(), 2)
	// Undo database changes
	db.prepare("UPDATE guild_space SET privacy_level = 0 WHERE guild_id = ?").run("112760669178241024")
})
