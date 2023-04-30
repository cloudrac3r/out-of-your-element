// @ts-check

const markdown = require("discord-markdown")

/**
 * @param {import("discord-api-types/v10").APIMessage} message
 * @returns {import("../../types").M_Room_Message_content}
 */
module.exports = function messageToEvent(message) {
	const body = message.content
	const html = markdown.toHTML(body, {
		/* discordCallback: {
			user: Function,
			channel: Function,
			role: Function,
			everyone: Function,
			here: Function
		} */
	}, null, null)
	return {
		msgtype: "m.text",
		body: body,
		format: "org.matrix.custom.html",
		formatted_body: html
	}
}
