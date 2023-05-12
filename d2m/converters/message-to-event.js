// @ts-check

const markdown = require("discord-markdown")

const passthrough = require("../../passthrough")
const { sync, db } = passthrough
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")

/**
 * @param {import("discord-api-types/v10").APIMessage} message
 */
async function messageToEvent(message) {
	const events = []

	// Text content appears first
	const body = message.content
	const html = markdown.toHTML(body, {
		discordCallback: {
			user: node => {
				const mxid = db.prepare("SELECT mxid FROM sim WHERE discord_id = ?").pluck().get(node.id)
				if (mxid) {
					return "https://matrix.to/#/" + mxid
				} else {
					return "@" + node.id
				}
			},
			channel: node => {
				const roomID = db.prepare("SELECT room_id FROM channel_room WHERE channel_id = ?").pluck().get(node.id)
				if (roomID) {
					return "https://matrix.to/#/" + roomID
				} else {
					return "#" + node.id
				}
			},
			role: node =>
				"@&" + node.id,
			everyone: node =>
				"@room",
			here: node =>
				"@here"
		}
	}, null, null)
	const isPlaintext = body === html
	if (isPlaintext) {
		events.push({
			$type: "m.room.message",
			msgtype: "m.text",
			body: body
		})
	} else {
		events.push({
			$type: "m.room.message",
			msgtype: "m.text",
			body: body,
			format: "org.matrix.custom.html",
			formatted_body: html
		})
	}

	// Then attachments
	const attachmentEvents = await Promise.all(message.attachments.map(async attachment => {
		// TODO: handle large files differently - link them instead of uploading
		if (attachment.content_type?.startsWith("image/") && attachment.width && attachment.height) {
			return {
				$type: "m.room.message",
				msgtype: "m.image",
				url: await file.uploadDiscordFileToMxc(attachment.url),
				external_url: attachment.url,
				body: attachment.filename,
				// TODO: filename: attachment.filename and then use body as the caption
				info: {
					mimetype: attachment.content_type,
					w: attachment.width,
					h: attachment.height,
					size: attachment.size
				}
			}
		} else {
			return {
				$type: "m.room.message",
				msgtype: "m.text",
				body: "Unsupported attachment:\n" + JSON.stringify(attachment, null, 2)
			}
		}
	}))
	events.push(...attachmentEvents)

	// Then stickers

	return events
}

module.exports.messageToEvent = messageToEvent
