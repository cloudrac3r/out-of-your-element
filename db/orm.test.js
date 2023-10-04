// @ts-check

const {test} = require("supertape")
const data = require("../test/data")

const {db, select, from} = require("../passthrough")

test("orm: select: get works", t => {
	const row = select("guild_space", "guild_id", "WHERE space_id = ?").get("!jjWAGMeQdNrVZSSfvz:cadence.moe")
	t.equal(row?.guild_id, data.guild.general.id)
})

test("orm: from: get works", t => {
	const row = from("guild_space").select("guild_id").and("WHERE space_id = ?").get("!jjWAGMeQdNrVZSSfvz:cadence.moe")
	t.equal(row?.guild_id, data.guild.general.id)
})

test("orm: select: get pluck works", t => {
	const guildID = select("guild_space", "guild_id", "WHERE space_id = ?").pluck().get("!jjWAGMeQdNrVZSSfvz:cadence.moe")
	t.equal(guildID, data.guild.general.id)
})

test("orm: from: get pluck works", t => {
	const guildID = from("guild_space").pluck("guild_id").and("WHERE space_id = ?").get("!jjWAGMeQdNrVZSSfvz:cadence.moe")
	t.equal(guildID, data.guild.general.id)
})

test("orm: from: join and pluck works", t => {
	const mxid = from("sim").join("sim_member", "mxid").and("WHERE discord_id = ? AND room_id = ?").pluck("mxid").get("771520384671416320", "!hYnGGlPHlbujVVfktC:cadence.moe")
	t.equal(mxid, "@_ooye_bojack_horseman:cadence.moe")
})
