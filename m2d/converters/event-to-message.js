// @ts-check

const assert = require("assert").strict
const DiscordTypes = require("discord-api-types/v10")
const markdown = require("discord-markdown")

const passthrough = require("../../passthrough")
const { sync, db, discord } = passthrough
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")

/**
 * @param {import("../../types").Event.Outer<import("../../types").Event.M_Room_Message>} event
 */
function eventToMessage(event) {
	/** @type {(DiscordTypes.RESTPostAPIWebhookWithTokenJSONBody & {files?: {name: string, file: Buffer}[]})[]} */
	const messages = []

	if (event.content.msgtype === "m.text") {
		messages.push({
			content: event.content.body,
			username: event.sender.replace(/^@/, ""),
			avatar_url: undefined, // TODO: provide the URL to the avatar from the homeserver's content repo
		})
	}

	return messages
}

module.exports.eventToMessage = eventToMessage
