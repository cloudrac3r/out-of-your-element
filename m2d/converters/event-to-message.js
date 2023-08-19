// @ts-check

const Ty = require("../../types")
const DiscordTypes = require("discord-api-types/v10")
const markdown = require("discord-markdown")

const passthrough = require("../../passthrough")
const { sync, db, discord } = passthrough
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")

/**
 * @param {Ty.Event.Outer<Ty.Event.M_Room_Message>} event
 */
function eventToMessage(event) {
	/** @type {(DiscordTypes.RESTPostAPIWebhookWithTokenJSONBody & {files?: {name: string, file: Buffer}[]})[]} */
	const messages = []

	let displayName = event.sender
	let avatarURL = undefined
	const match = event.sender.match(/^@(.*?):/)
	if (match) {
		displayName = match[1]
		// TODO: get the media repo domain and the avatar url from the matrix member event
	}

	if (event.content.msgtype === "m.text") {
		messages.push({
			content: event.content.body,
			username: displayName,
			avatar_url: avatarURL
		})
	}

	return messages
}

module.exports.eventToMessage = eventToMessage
