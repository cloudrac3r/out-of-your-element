// @ts-check

const {test} = require("supertape")
const data = require("../test/data")

const {db, select, from} = require("../passthrough")

test("orm: select: get works", t => {
	const row = select("guild_space", "guild_id", {}, "WHERE space_id = ?").get("!jjWAGMeQdNrVZSSfvz:cadence.moe")
	t.equal(row?.guild_id, data.guild.general.id)
})

test("orm: from: get works", t => {
	const row = from("guild_space").select("guild_id").and("WHERE space_id = ?").get("!jjWAGMeQdNrVZSSfvz:cadence.moe")
	t.equal(row?.guild_id, data.guild.general.id)
})

test("orm: select: get pluck works", t => {
	const guildID = select("guild_space", "guild_id", {}, "WHERE space_id = ?").pluck().get("!jjWAGMeQdNrVZSSfvz:cadence.moe")
	t.equal(guildID, data.guild.general.id)
})

test("orm: select: get, where and pluck works", t => {
	const channelID = select("message_channel", "channel_id", {message_id: "1128118177155526666"}).pluck().get()
	t.equal(channelID, "112760669178241024")
})

test("orm: select: all, where and pluck works on multiple columns", t => {
	const names = select("member_cache", "displayname", {room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe", mxid: "@cadence:cadence.moe"}).pluck().all()
	t.deepEqual(names, ["cadence [they]"])
})

test("orm: from: get pluck works", t => {
	const guildID = from("guild_space").pluck("guild_id").and("WHERE space_id = ?").get("!jjWAGMeQdNrVZSSfvz:cadence.moe")
	t.equal(guildID, data.guild.general.id)
})

test("orm: from: join and pluck works", t => {
	const mxid = from("sim").join("sim_member", "mxid").and("WHERE user_id = ? AND room_id = ?").pluck("mxid").get("771520384671416320", "!hYnGGlPHlbujVVfktC:cadence.moe")
	t.equal(mxid, "@_ooye_bojack_horseman:cadence.moe")
})

test("orm: from: where and pluck works", t => {
	const subtypes = from("event_message").where({message_id: "1141501302736695316"}).pluck("event_subtype").all()
	t.deepEqual(subtypes.sort(), ["m.image", "m.text"])
})
