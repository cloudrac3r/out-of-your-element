// @ts-check

const {test} = require("supertape")
const data = require("../../test/data")

const {db, select, from} = require("../passthrough")

test("orm: select: get works", t => {
	const row = select("guild_space", "guild_id", {}, "WHERE space_id = ?").get("!jjmvBegULiLucuWEHU:cadence.moe")
	t.equal(row?.guild_id, data.guild.general.id)
})

test("orm: from: get works", t => {
	const row = from("guild_space").select("guild_id").and("WHERE space_id = ?").get("!jjmvBegULiLucuWEHU:cadence.moe")
	t.equal(row?.guild_id, data.guild.general.id)
})

test("orm: select: get pluck works", t => {
	const guildID = select("guild_space", "guild_id", {}, "WHERE space_id = ?").pluck().get("!jjmvBegULiLucuWEHU:cadence.moe")
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

test("orm: select: in array works", t => {
	const ids = select("emoji", "emoji_id", {name: ["online", "upstinky"]}).pluck().all()
	t.deepEqual(ids, ["288858540888686602", "606664341298872324"])
})

test("orm: from: get pluck works", t => {
	const guildID = from("guild_space").pluck("guild_id").and("WHERE space_id = ?").get("!jjmvBegULiLucuWEHU:cadence.moe")
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

test("orm: from: join direction works", t => {
	const hasOwner = from("sim").join("sim_proxy", "user_id", "left").select("user_id", "proxy_owner_id").where({sim_name: "_pk_zoego"}).get()
	t.deepEqual(hasOwner, {user_id: "43d378d5-1183-47dc-ab3c-d14e21c3fe58", proxy_owner_id: "196188877885538304"})
	const hasNoOwner = from("sim").join("sim_proxy", "user_id", "left").select("user_id", "proxy_owner_id").where({sim_name: "crunch_god"}).get()
	t.deepEqual(hasNoOwner, {user_id: "820865262526005258", proxy_owner_id: null})
	const hasNoOwnerInner = from("sim").join("sim_proxy", "user_id", "inner").select("user_id", "proxy_owner_id").where({sim_name: "crunch_god"}).get()
	t.deepEqual(hasNoOwnerInner, undefined)
})

test("orm: select unsafe works (to select complex column names that can't be type verified)", t => {
	const results = from("member_cache")
		.join("member_power", "mxid")
		.join("channel_room", "room_id") // only include rooms that are bridged
		.and("where member_power.room_id = '*' and member_cache.power_level != member_power.power_level")
		.selectUnsafe("mxid", "member_cache.room_id", "member_power.power_level")
		.all()
	t.equal(results[0].power_level, 100)
})
