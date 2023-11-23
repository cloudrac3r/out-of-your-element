const {test} = require("supertape")
const data = require("../test/data")
const utils = require("./utils")

test("is webhook message: identifies bot interaction response as not a message", t => {
	t.equal(utils.isWebhookMessage(data.interaction_message.thinking_interaction), false)
})

test("is webhook message: identifies webhook interaction response as not a message", t => {
	t.equal(utils.isWebhookMessage(data.interaction_message.thinking_interaction_without_bot_user), false)
})

test("is webhook message: identifies webhook message as a message", t => {
	t.equal(utils.isWebhookMessage(data.special_message.bridge_echo_webhook), true)
})

test("discord utils: converts snowflake to timestamp", t => {
	t.equal(utils.snowflakeToTimestampExact("86913608335773696"), 1440792219004)
})

test("discerd utils: converts timestamp to snowflake", t => {
	t.match(utils.timestampToSnowflakeInexact(1440792219004), /^869136083357.....$/)
})
