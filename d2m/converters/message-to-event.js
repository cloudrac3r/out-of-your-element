// @ts-check

const assert = require("assert").strict
const markdown = require("discord-markdown")

const passthrough = require("../../passthrough")
const { sync, db, discord } = passthrough
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")

function getDiscordParseCallbacks(message, useHTML) {
	return {
		user: node => {
			const mxid = db.prepare("SELECT mxid FROM sim WHERE discord_id = ?").pluck().get(node.id)
			const username = message.mentions.find(ment => ment.id === node.id)?.username || node.id
			if (mxid && useHTML) {
				return `<a href="https://matrix.to/#/${mxid}">@${username}</a>`
			} else {
				return `@${username}:`
			}
		},
		channel: node => {
			const {room_id, name, nick} = db.prepare("SELECT room_id, name, nick FROM channel_room WHERE channel_id = ?").get(node.id)
			if (room_id && useHTML) {
				return `<a href="https://matrix.to/#/${room_id}">#${nick || name}</a>`
			} else {
				return `#${nick || name}`
			}
		},
		role: node =>
			"@&" + node.id,
		everyone: node =>
			"@room",
		here: node =>
			"@here"
	}
}

/**
 * @param {import("discord-api-types/v10").APIMessage} message
 * @param {import("discord-api-types/v10").APIGuild} guild
 */
async function messageToEvent(message, guild) {
	const events = []

	// Text content appears first
	if (message.content) {
		let content = message.content
		content = content.replace(/https:\/\/(?:ptb\.|canary\.|www\.)?discord(?:app)?\.com\/channels\/([0-9]+)\/([0-9]+)\/([0-9]+)/, (whole, guildID, channelID, messageID) => {
			const row = db.prepare("SELECT room_id, event_id FROM event_message INNER JOIN channel_room USING (channel_id) WHERE channel_id = ? AND message_id = ? AND part = 0").get(channelID, messageID)
			if (row) {
				return `https://matrix.to/#/${row.room_id}/${row.event_id}`
			} else {
				return `${whole} [event not found]`
			}
		})

		const html = markdown.toHTML(content, {
			discordCallback: getDiscordParseCallbacks(message, true)
		}, null, null)

		const body = markdown.toHTML(content, {
			discordCallback: getDiscordParseCallbacks(message, false),
			discordOnly: true,
			escapeHTML: false,
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
	if (message.sticker_items) {
		const stickerEvents = await Promise.all(message.sticker_items.map(async stickerItem => {
			const format = file.stickerFormat.get(stickerItem.format_type)
			if (format?.mime) {
				let body = stickerItem.name
				const sticker = guild.stickers.find(sticker => sticker.id === stickerItem.id)
				if (sticker && sticker.description) body += ` - ${sticker.description}`
				return {
					$type: "m.sticker",
					body,
					info: {
						mimetype: format.mime
					},
					url: await file.uploadDiscordFileToMxc(file.sticker(stickerItem))
				}
			} else {
				return {
					$type: "m.room.message",
					msgtype: "m.text",
					body: "Unsupported sticker format. Name: " + stickerItem.name
				}
			}
		}))
		events.push(...stickerEvents)
	}

	return events
}

module.exports.messageToEvent = messageToEvent
