// @ts-check

const {defineEventHandler, getValidatedQuery, H3Event, setResponseHeader} = require("h3")
const {as, db, sync} = require("../../passthrough")
const {reg} = require("../../matrix/read-registration")

/** @type {import("../../discord/utils")} */
const dUtils = sync.require("../../discord/utils")

// Calculation takes time and is single-threaded. I could add database indexes, but this is simpler and doesn't need storage.
const STATS_CACHE_TIME = 10 * 60 * 1000 // 10 minutes

function getMessageCountLastDuration(duration) {
	const snowflake = dUtils.timestampToSnowflakeInexact(Date.now() - duration)
	return db.prepare("select count(*) from message_room where message_id >= ? and length(message_id) = ?").pluck().get(snowflake, snowflake.length)
}

function getStats() {
	const durations = [
		["week", 7 * 24 * 60 * 60 * 1000],
		["day", 1 * 24 * 60 * 60 * 1000],
		["hour", 1 * 60 * 60 * 1000]
	]

	// console.time("get stats")
	let temp = {
		guilds: db.prepare("select count(*) from guild_space").pluck().get(),
		channels: db.prepare("select count(*) from channel_room").pluck().get(),
		messages: db.prepare("select count(*) from message_room").pluck().get(),
		...durations.reduce((a, c) => (a[`messages_last_${c[0]}`] = getMessageCountLastDuration(c[1]), a), {}),
		message_sources: db.prepare("select count(*) from event_message where part = 0 group by source order by source").pluck().all(),
		oldest_message: new Date(dUtils.snowflakeToTimestampExact(db.prepare("select min(message_id) from event_message where source = 0").pluck().get())), // good until 2090
		discord_users: db.prepare("select count(*) from sim").pluck().get(),
		matrix_users: db.prepare("select count(distinct mxid) from member_cache where mxid not like ?").pluck().get(reg.namespaces.users[0].regex.replace(/\.\*.*/, "%")),
	}
	// console.timeEnd("get stats")
	return temp
}

/** @type {ReturnType<typeof getStats>} */
let stats
let statsUpdatedAt = 0

function updateStatsIfOld() {
	if (statsUpdatedAt < Date.now() - STATS_CACHE_TIME) {
		stats = getStats()
		statsUpdatedAt = Date.now()
	}
}

as.router.get("/api/stats", defineEventHandler(async event => {
	updateStatsIfOld()
	return {
		...stats,
		oldest_message: stats.oldest_message.toISOString(),
	}
}))

as.router.get("/metrics", defineEventHandler(async event => {
	updateStatsIfOld()
	setResponseHeader(event, "content-type", "text/plain")
	return `
# HELP guilds Total number of guilds
# TYPE guilds gauge
ooye_guilds_total ${stats.guilds}

# HELP channels Total number of channels
# TYPE channels gauge
ooye_channels_total ${stats.channels}

# HELP messages_total Total number of messages sent from each side
# TYPE messages_total gauge
ooye_messages_total{type="matrix"} ${stats.message_sources[0]}
ooye_messages_total{type="discord"} ${stats.message_sources[1]}

# HELP oldest_message_timestamp Unix timestamp of the oldest message
# TYPE oldest_message_timestamp gauge
ooye_oldest_message_timestamp_seconds ${stats.oldest_message.getTime() / 1000}

# HELP ooye_users_total Total number of users on each side
# TYPE ooye_users_total gauge
ooye_users_total{type="matrix"} ${stats.matrix_users}
ooye_users_total{type="discord"} ${stats.discord_users}
`.trimStart()
}))
