const {discord, db, from, select, sync} = require("../../passthrough")
/** @type {import("../../discord/utils")} */
const dUtils = sync.require("../../discord/utils")

const ones = "₀₁₂₃₄₅₆₇₈₉"
const tens = "0123456789"

/* c8 ignore start */

module.exports = async function(db) {
	// added tolerance to https://discordstatus.com/incidents/4hpm4454hxtx
	const OUTAGE_START = 1778263200000
	const OUTAGE_END =   1778284800000

	const startSnowflake = dUtils.timestampToSnowflakeInexact(OUTAGE_START)
	const endSnowflake =   dUtils.timestampToSnowflakeInexact(OUTAGE_END)

	const affectedChannels = from("message_room").join("historical_channel_room", "historical_room_index")
		.pluck("reference_channel_id").selectUnsafe("DISTINCT reference_channel_id")
		.and("WHERE message_id >= ? AND message_id <= ? AND length(message_id) = ?").all(startSnowflake, endSnowflake, startSnowflake.length)
	const affectedWebhooks = select("webhook", ["channel_id", "webhook_id", "webhook_token"], {channel_id: affectedChannels}).all()

	if (affectedWebhooks.length) {
		process.stdout.write(`  revoking ${affectedWebhooks.length} possibly compromised webhooks... `)
		for (let counter = 1; counter <= affectedWebhooks.length; counter++) {
			const webhook = affectedWebhooks[counter-1]

			await discord.snow.webhook.deleteWebhookToken(webhook.webhook_id, webhook.webhook_token, "Webhook token possibly compromised during 8th May 2026 outage").catch(e => {
				if (e.message === `{"message": "Unknown Webhook", "code": 10015}`) {
					// OK
				} else {
					throw e
				}
			})
			db.prepare("DELETE FROM webhook WHERE channel_id = ?").run(webhook.channel_id)

			process.stdout.write(String(counter).at(-1) === "0" ? tens[(counter/10)%10] : ones[counter%10])
		}
		process.stdout.write("\n")
	}
}
