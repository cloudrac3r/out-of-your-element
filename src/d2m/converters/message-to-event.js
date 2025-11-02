// @ts-check

const assert = require("assert").strict
const markdown = require("@cloudrac3r/discord-markdown")
const pb = require("prettier-bytes")
const DiscordTypes = require("discord-api-types/v10")
const {tag} = require("@cloudrac3r/html-template-tag")

const passthrough = require("../../passthrough")
const {sync, db, discord, select, from} = passthrough
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")
/** @type {import("./emoji-to-key")} */
const emojiToKey = sync.require("./emoji-to-key")
/** @type {import("../actions/lottie")} */
const lottie = sync.require("../actions/lottie")
/** @type {import("../../m2d/converters/utils")} */
const mxUtils = sync.require("../../m2d/converters/utils")
/** @type {import("../../discord/utils")} */
const dUtils = sync.require("../../discord/utils")
const {reg} = require("../../matrix/read-registration")

const userRegex = reg.namespaces.users.map(u => new RegExp(u.regex))

/**
 * @param {DiscordTypes.APIMessage} message
 * @param {DiscordTypes.APIGuild} guild
 * @param {boolean} useHTML
 */
function getDiscordParseCallbacks(message, guild, useHTML) {
	return {
		/** @param {{id: string, type: "discordUser"}} node */
		user: node => {
			const mxid = select("sim", "mxid", {user_id: node.id}).pluck().get()
			const interaction = message.interaction_metadata || message.interaction
			const username = message.mentions?.find(ment => ment.id === node.id)?.username
				|| message.referenced_message?.mentions?.find(ment => ment.id === node.id)?.username
				|| (interaction?.user.id === node.id ? interaction.user.username : null)
				|| (message.author.id === node.id ? message.author.username : null)
				|| node.id
			if (mxid && useHTML) {
				return `<a href="https://matrix.to/#/${mxid}">@${username}</a>`
			} else {
				return `@${username}:`
			}
		},
		/** @param {{id: string, type: "discordChannel", row: {room_id: string, name: string, nick: string?}?, via: string}} node */
		channel: node => {
			if (!node.row) { // fallback for when this channel is not bridged
				const channel = discord.channels.get(node.id)
				if (channel) {
					return `#${channel.name} [channel not bridged]`
				} else {
					return `#unknown-channel [channel from an unbridged server]`
				}
			} else if (useHTML) {
				return `<a href="https://matrix.to/#/${node.row.room_id}?${node.via}">#${node.row.nick || node.row.name}</a>`
			} else {
				return `#${node.row.nick || node.row.name}`
			}
		},
		/** @param {{animated: boolean, name: string, id: string, type: "discordEmoji"}} node */
		emoji: node => {
			if (useHTML) {
				const mxc = select("emoji", "mxc_url", {emoji_id: node.id}).pluck().get()
				assert(mxc, `Emoji consistency assertion failed for ${node.name}:${node.id}`) // All emojis should have been added ahead of time in the messageToEvent function.
				return `<img data-mx-emoticon height="32" src="${mxc}" title=":${node.name}:" alt=":${node.name}:">`
			} else {
				return `:${node.name}:`
			}
		},
		role: node => {
			const role = guild.roles.find(r => r.id === node.id)
			if (!role) {
				// This fallback should only trigger if somebody manually writes a silly message, or if the cache breaks (hasn't happened yet).
				// If the cache breaks, fix discord-packets.js to store role info properly.
				return "@&" + node.id
			} else if (useHTML && role.color) {
				return `<font color="#${role.color.toString(16)}">@${role.name}</font>`
			} else if (useHTML) {
				return `<span data-mx-color="#ffffff" data-mx-bg-color="#414eef">@${role.name}</span>`
			} else {
				return `@${role.name}:`
			}
		},
		everyone: () => {
			if (message.mention_everyone) return "@room"
			return "@everyone"
		},
		here: () => {
			if (message.mention_everyone) return "@room"
			return "@here"
		}
	}
}

const embedTitleParser = markdown.markdownEngine.parserFor({
	...markdown.rules,
	autolink: undefined,
	link: undefined
})

/**
 * @param {{room?: boolean, user_ids?: string[]}} mentions
 * @param {DiscordTypes.APIAttachment} attachment
 */
async function attachmentToEvent(mentions, attachment) {
	const external_url = dUtils.getPublicUrlForCdn(attachment.url)
	const emoji =
		attachment.content_type?.startsWith("image/jp") ? "📸"
		: attachment.content_type?.startsWith("image/") ? "🖼️"
		: attachment.content_type?.startsWith("video/") ? "🎞️"
		: attachment.content_type?.startsWith("text/") ? "📝"
		: attachment.content_type?.startsWith("audio/") ? "🎶"
		: "📄"
	// no native media spoilers in Element, so we'll post a link instead, forcing it to not preview using a blockquote
	if (attachment.filename.startsWith("SPOILER_")) {
		return {
			$type: "m.room.message",
			"m.mentions": mentions,
			msgtype: "m.text",
			body: `${emoji} Uploaded SPOILER file: ${external_url} (${pb(attachment.size)})`,
			format: "org.matrix.custom.html",
			formatted_body: `<blockquote>${emoji} Uploaded SPOILER file: <a href="${external_url}">${external_url}</a> (${pb(attachment.size)})</blockquote>`
		}
	}
	// for large files, always link them instead of uploading so I don't use up all the space in the content repo
	else if (attachment.size > reg.ooye.max_file_size) {
		return {
			$type: "m.room.message",
			"m.mentions": mentions,
			msgtype: "m.text",
			body: `${emoji} Uploaded file: ${external_url} (${pb(attachment.size)})`,
			format: "org.matrix.custom.html",
			formatted_body: `${emoji} Uploaded file: <a href="${external_url}">${attachment.filename}</a> (${pb(attachment.size)})`
		}
	} else if (attachment.content_type?.startsWith("image/") && attachment.width && attachment.height) {
		return {
			$type: "m.room.message",
			"m.mentions": mentions,
			msgtype: "m.image",
			url: await file.uploadDiscordFileToMxc(attachment.url),
			external_url,
			body: attachment.description || attachment.filename,
			filename: attachment.filename,
			info: {
				mimetype: attachment.content_type,
				w: attachment.width,
				h: attachment.height,
				size: attachment.size
			}
		}
	} else if (attachment.content_type?.startsWith("video/") && attachment.width && attachment.height) {
		return {
			$type: "m.room.message",
			"m.mentions": mentions,
			msgtype: "m.video",
			url: await file.uploadDiscordFileToMxc(attachment.url),
			external_url,
			body: attachment.description || attachment.filename,
			filename: attachment.filename,
			info: {
				mimetype: attachment.content_type,
				w: attachment.width,
				h: attachment.height,
				size: attachment.size
			}
		}
	} else if (attachment.content_type?.startsWith("audio/")) {
		return {
			$type: "m.room.message",
			"m.mentions": mentions,
			msgtype: "m.audio",
			url: await file.uploadDiscordFileToMxc(attachment.url),
			external_url,
			body: attachment.description || attachment.filename,
			filename: attachment.filename,
			info: {
				mimetype: attachment.content_type,
				size: attachment.size,
				duration: attachment.duration_secs ? Math.round(attachment.duration_secs * 1000) : undefined
			}
		}
	} else {
		return {
			$type: "m.room.message",
			"m.mentions": mentions,
			msgtype: "m.file",
			url: await file.uploadDiscordFileToMxc(attachment.url),
			external_url,
			body: attachment.description || attachment.filename,
			filename: attachment.filename,
			info: {
				mimetype: attachment.content_type,
				size: attachment.size
			}
		}
	}
}

/**
 * @param {DiscordTypes.APIMessage} message
 * @param {DiscordTypes.APIGuild} guild
 * @param {{includeReplyFallback?: boolean, includeEditFallbackStar?: boolean, alwaysReturnFormattedBody?: boolean, scanTextForMentions?: boolean}} options default values:
 * - includeReplyFallback: true
 * - includeEditFallbackStar: false
 * - alwaysReturnFormattedBody: false - formatted_body will be skipped if it is the same as body because the message is plaintext. if you want the formatted_body to be returned anyway, for example to merge it with another message, then set this to true.
 * - scanTextForMentions: true - needs to be set to false when converting forwarded messages etc which may be from a different channel that can't be scanned.
 * @param {{api: import("../../matrix/api"), snow?: import("snowtransfer").SnowTransfer}} di simple-as-nails dependency injection for the matrix API
 * @returns {Promise<{$type: string, $sender?: string, [x: string]: any}[]>}
 */
async function messageToEvent(message, guild, options = {}, di) {
	const events = []

	/* c8 ignore next 7 */
	if (message.type === DiscordTypes.MessageType.ThreadCreated) {
		// This is the kind of message that appears when somebody makes a thread which isn't close enough to the message it's based off.
		// It lacks the lines and the pill, so it looks kind of like a member join message, and it says:
		// [#] NICKNAME started a thread: __THREAD NAME__. __See all threads__
		// We're already bridging the THREAD_CREATED gateway event to make a comparable message, so drop this one.
		return []
	}

	if (message.type === DiscordTypes.MessageType.ThreadStarterMessage) {
		// This is the message that appears at the top of a thread when the thread was based off an existing message.
		// It's just a message reference, no content.
		const ref = message.message_reference
		assert(ref)
		assert(ref.message_id)
		const eventID = select("event_message", "event_id", {message_id: ref.message_id}).pluck().get()
		const roomID = select("channel_room", "room_id", {channel_id: ref.channel_id}).pluck().get()
		if (!eventID || !roomID) return []
		const event = await di.api.getEvent(roomID, eventID)
		return [{
			...event.content,
			$type: event.type,
			$sender: null
		}]
	}

	const interaction = message.interaction_metadata || message.interaction
	if (message.type === DiscordTypes.MessageType.ChatInputCommand && interaction && "name" in interaction) {
		// Commands are sent by the responding bot. Need to attach the metadata of the person using the command at the top.
		let content = message.content
		if (content) content = `\n${content}`
		else if ((message.flags || 0) & DiscordTypes.MessageFlags.Loading) content = " — interaction loading..."
		content = `> ↪️ <@${interaction.user.id}> used \`/${interaction.name}\`${content}`
		message = {...message, content} // editToChanges reuses the object so we can't mutate it. have to clone it
	}

	/**
	   @type {{room?: boolean, user_ids?: string[]}}
		We should consider the following scenarios for mentions:
		1. A discord user rich-replies to a matrix user with a text post
			+ The matrix user needs to be m.mentioned in the text event
			+ The matrix user needs to have their name/mxid/link in the text event (notification fallback)
				- So prepend their `@name:` to the start of the plaintext body
		2. A discord user rich-replies to a matrix user with an image event only
			+ The matrix user needs to be m.mentioned in the image event
			+ TODO The matrix user needs to have their name/mxid in the image event's body field, alongside the filename (notification fallback)
				- So append their name to the filename body, I guess!!!
		3. A discord user `@`s a matrix user in the text body of their text box
			+ The matrix user needs to be m.mentioned in the text event
			+ No change needed to the text event content: it already has their name
				- So make sure we don't do anything in this case.
	*/
	const mentions = {}
	/** @type {{event_id: string, room_id: string, source: number}?} */
	let repliedToEventRow = null
	let repliedToUnknownEvent = false
	let repliedToEventSenderMxid = null

	if (message.mention_everyone) mentions.room = true

	function addMention(mxid) {
		if (!mentions.user_ids) mentions.user_ids = []
		if (!mentions.user_ids.includes(mxid)) mentions.user_ids.push(mxid)
	}

	// Mentions scenarios 1 and 2, part A. i.e. translate relevant message.mentions to m.mentions
	// (Still need to do scenarios 1 and 2 part B, and scenario 3.)
	if (message.type === DiscordTypes.MessageType.Reply && message.message_reference?.message_id) {
		const row = from("event_message").join("message_channel", "message_id").join("channel_room", "channel_id").select("event_id", "room_id", "source").and("WHERE message_id = ? AND part = 0").get(message.message_reference.message_id)
		if (row) {
			repliedToEventRow = row
		} else if (message.referenced_message) {
			repliedToUnknownEvent = true
		}
	} else if (dUtils.isWebhookMessage(message) && message.embeds[0]?.author?.name?.endsWith("↩️")) {
		// It could be a PluralKit emulated reply, let's see if it has a message link
		const isEmulatedReplyToText = message.embeds[0].description?.startsWith("**[Reply to:]")
		const isEmulatedReplyToAttachment = message.embeds[0].description?.startsWith("*[(click to see attachment")
		if (isEmulatedReplyToText || isEmulatedReplyToAttachment) {
			assert(message.embeds[0].description)
			const match = message.embeds[0].description.match(/\/channels\/[0-9]*\/[0-9]*\/([0-9]{2,})/)
			if (match) {
				const row = from("event_message").join("message_channel", "message_id").join("channel_room", "channel_id").select("event_id", "room_id", "source").and("WHERE message_id = ? AND part = 0").get(match[1])
				if (row) {
					/*
						we generate a partial referenced_message based on what PK provided. we don't need everything, since this will only be used for further message-to-event converting.
						the following properties are necessary:
						- content: used for generating the reply fallback
						- author: used for the top of the reply fallback (only used for discord authors. for matrix authors, repliedToEventSenderMxid is set.)
					*/
					const emulatedMessageContent =
						( isEmulatedReplyToAttachment ? "[Media]"
						: message.embeds[0].description.replace(/^.*?\)\*\*\s*/, ""))
					message.referenced_message = {
						content: emulatedMessageContent,
						// @ts-ignore
						author: {
							username: message.embeds[0].author.name.replace(/\s*↩️\s*$/, "")
						}
					}
					message.embeds.shift()
					repliedToEventRow = row
				}
			}
		}
	}
	if (repliedToEventRow && repliedToEventRow.source === 0) { // reply was originally from Matrix
		// Need to figure out who sent that event...
		const event = await di.api.getEvent(repliedToEventRow.room_id, repliedToEventRow.event_id)
		repliedToEventSenderMxid = event.sender
		// Need to add the sender to m.mentions
		addMention(repliedToEventSenderMxid)
	}

	/** @type {Map<string, Promise<string>>} */
	const viaMemo = new Map()
	/**
	 * @param {string} roomID
	 * @returns {Promise<string>} string encoded URLSearchParams
	 */
	function getViaServersMemo(roomID) {
		// @ts-ignore
		if (viaMemo.has(roomID)) return viaMemo.get(roomID)
		const promise = mxUtils.getViaServersQuery(roomID, di.api).then(p => p.toString())
		viaMemo.set(roomID, promise)
		return promise
	}

	/**
	 * Translate Discord message links to Matrix event links.
	 * If OOYE has handled this message in the past, this is an instant database lookup.
	 * Otherwise, if OOYE knows the channel, this is a multi-second request to /timestamp_to_event to approximate.
	 * @param {string} content Partial or complete Discord message content
	 */
	async function transformContentMessageLinks(content) {
		let offset = 0
		for (const match of [...content.matchAll(/https:\/\/(?:ptb\.|canary\.|www\.)?discord(?:app)?\.com\/channels\/[0-9]+\/([0-9]+)\/([0-9]+)/g)]) {
			assert(typeof match.index === "number")
			const [_, channelID, messageID] = match
			let result

			const roomID = select("channel_room", "room_id", {channel_id: channelID}).pluck().get()
			if (roomID) {
				const eventID = select("event_message", "event_id", {message_id: messageID}).pluck().get()
				const via = await getViaServersMemo(roomID)
				if (eventID && roomID) {
					result = `https://matrix.to/#/${roomID}/${eventID}?${via}`
				} else {
					const ts = dUtils.snowflakeToTimestampExact(messageID)
					try {
						const {event_id} = await di.api.getEventForTimestamp(roomID, ts)
						result = `https://matrix.to/#/${roomID}/${event_id}?${via}`
					} catch (e) {
						// M_NOT_FOUND: Unable to find event from <ts> in direction Direction.FORWARDS
						result = `[unknown event, timestamp resolution failed, in room: https://matrix.to/#/${roomID}?${via}]`
					}
				}
			} else {
				result = `${match[0]} [event is from another server]`
			}

			content = content.slice(0, match.index + offset) + result + content.slice(match.index + match[0].length + offset)
			offset += result.length - match[0].length
		}
		return content
	}

	/**
	 * Translate Discord attachment links into links that go via the bridge, so they last forever.
	 */
	function transformAttachmentLinks(content) {
		return content.replace(/https:\/\/(cdn|media)\.discordapp\.(?:com|net)\/attachments\/([0-9]+)\/([0-9]+)\/([-A-Za-z0-9_.,]+)/g, url => dUtils.getPublicUrlForCdn(url))
	}

	/**
	 * Translate links and emojis and mentions and stuff. Give back the text and HTML so they can be combined into bigger events.
	 * @param {string} content Partial or complete Discord message content
	 * @param {any} customOptions
	 * @param {any} customParser
	 * @param {any} customHtmlOutput
	 */
	async function transformContent(content, customOptions = {}, customParser = null, customHtmlOutput = null) {
		content = transformAttachmentLinks(content)
		content = await transformContentMessageLinks(content)

		// Handling emojis that we don't know about. The emoji has to be present in the DB for it to be picked up in the emoji markdown converter.
		// So we scan the message ahead of time for all its emojis and ensure they are in the DB.
		const emojiMatches = [...content.matchAll(/<(a?):([^:>]{1,64}):([0-9]+)>/g)]
		await Promise.all(emojiMatches.map(match => {
			const id = match[3]
			const name = match[2]
			const animated = !!match[1]
			return emojiToKey.emojiToKey({id, name, animated}, message.id) // Register the custom emoji if needed
		}))

		async function transformParsedVia(parsed) {
			for (const node of parsed) {
				if (node.type === "discordChannel" || node.type === "discordChannelLink") {
					node.row = select("channel_room", ["room_id", "name", "nick"], {channel_id: node.id}).get()
					if (node.row?.room_id) {
						node.via = await getViaServersMemo(node.row.room_id)
					}
				}
				for (const maybeChildNodesArray of [node, node.content, node.items]) {
					if (Array.isArray(maybeChildNodesArray)) {
						await transformParsedVia(maybeChildNodesArray)
					}
				}
			}
			return parsed
		}

		let html = await markdown.toHtmlWithPostParser(content, transformParsedVia, {
			discordCallback: getDiscordParseCallbacks(message, guild, true),
			...customOptions
		}, customParser, customHtmlOutput)

		let body = await markdown.toHtmlWithPostParser(content, transformParsedVia, {
			discordCallback: getDiscordParseCallbacks(message, guild, false),
			discordOnly: true,
			escapeHTML: false,
			...customOptions
		})

		return {body, html}
	}

	/**
	 * After converting Discord content to Matrix plaintext and HTML content, post-process the bodies and push the resulting text event
	 * @param {string} body matrix event plaintext body
	 * @param {string} html matrix event HTML body
	 * @param {string} msgtype matrix event msgtype (maybe m.text or m.notice)
	 */
	async function addTextEvent(body, html, msgtype) {
		// Star * prefix for fallback edits
		if (options.includeEditFallbackStar) {
			body = "* " + body
			html = "* " + html
		}

		const flags = message.flags || 0
		if (flags & DiscordTypes.MessageFlags.IsCrosspost) {
			body = `[🔀 ${message.author.username}]\n` + body
			html = `🔀 <strong>${message.author.username}</strong><br>` + html
		}

		// Fallback body/formatted_body for replies
		// This branch is optional - do NOT change anything apart from the reply fallback, since it may not be run
		if ((repliedToEventRow || repliedToUnknownEvent) && options.includeReplyFallback !== false) {
			let repliedToDisplayName
			let repliedToUserHtml
			if (repliedToEventRow?.source === 0 && repliedToEventSenderMxid) {
				const match = repliedToEventSenderMxid.match(/^@([^:]*)/)
				assert(match)
				repliedToDisplayName = message.referenced_message?.author.username || match[1] || "a Matrix user" // grab the localpart as the display name, whatever
				repliedToUserHtml = `<a href="https://matrix.to/#/${repliedToEventSenderMxid}">${repliedToDisplayName}</a>`
			} else {
				repliedToDisplayName = message.referenced_message?.author.global_name || message.referenced_message?.author.username || "a Discord user"
				repliedToUserHtml = repliedToDisplayName
			}
			let repliedToContent = message.referenced_message?.content
			if (repliedToContent?.match(/^(-# )?> (-# )?<:L1:/)) {
				// If the Discord user is replying to a Matrix user's reply, the fallback is going to contain the emojis and stuff from the bridged rep of the Matrix user's reply quote.
				// Need to remove that previous reply rep from this fallback body. The fallbody body should only contain the Matrix user's actual message.
				//                                            ┌──────A─────┐       A reply rep starting with >quote or -#smalltext >quote. Match until the end of the line.
				//                                            ┆            ┆┌─B─┐  There may be up to 2 reply rep lines in a row if it was created in the old format. Match all lines.
				repliedToContent = repliedToContent.replace(/^((-# )?> .*\n){1,2}/, "")
			}
			if (repliedToContent == "") repliedToContent = "[Media]"
			else if (!repliedToContent) repliedToContent = "[Replied-to message content wasn't provided by Discord]"
			const {body: repliedToBody, html: repliedToHtml} = await transformContent(repliedToContent)
			if (repliedToEventRow) {
				// Generate a reply pointing to the Matrix event we found
				html = `<mx-reply><blockquote><a href="https://matrix.to/#/${repliedToEventRow.room_id}/${repliedToEventRow.event_id}">In reply to</a> ${repliedToUserHtml}`
					+ `<br>${repliedToHtml}</blockquote></mx-reply>`
					+ html
				body = (`${repliedToDisplayName}: ` // scenario 1 part B for mentions
					+ repliedToBody).split("\n").map(line => "> " + line).join("\n")
					+ "\n\n" + body
			} else { // repliedToUnknownEvent
				// This reply can't point to the Matrix event because it isn't bridged, we need to indicate this.
				assert(message.referenced_message)
				const dateDisplay = dUtils.howOldUnbridgedMessage(message.referenced_message.timestamp, message.timestamp)
				html = `<blockquote>In reply to ${dateDisplay} from ${repliedToDisplayName}:`
					+ `<br>${repliedToHtml}</blockquote>`
					+ html
				body = (`In reply to ${dateDisplay}:\n${repliedToDisplayName}: `
					+ repliedToBody).split("\n").map(line => "> " + line).join("\n")
					+ "\n\n" + body
			}
		}

		const newTextMessageEvent = {
			$type: "m.room.message",
			"m.mentions": mentions,
			msgtype,
			body: body
		}

		const isPlaintext = body === html

		if (!isPlaintext || options.alwaysReturnFormattedBody) {
			Object.assign(newTextMessageEvent, {
				format: "org.matrix.custom.html",
				formatted_body: html
			})
		}

		events.push(newTextMessageEvent)
	}


	let msgtype = "m.text"
	// Handle message type 4, channel name changed
	if (message.type === DiscordTypes.MessageType.ChannelNameChange) {
		msgtype = "m.emote"
		message.content = "changed the channel name to **" + message.content + "**"
	}

	// Forwarded content appears first
	if (message.message_reference?.type === DiscordTypes.MessageReferenceType.Forward && message.message_snapshots?.length) {
		// Forwarded notice
		const eventID = select("event_message", "event_id", {message_id: message.message_reference.message_id}).pluck().get()
		const room = select("channel_room", ["room_id", "name", "nick"], {channel_id: message.message_reference.channel_id}).get()
		const forwardedNotice = new mxUtils.MatrixStringBuilder()
		if (room) {
			const roomName = room && (room.nick || room.name)
			const via = await getViaServersMemo(room.room_id)
			if (eventID) {
				forwardedNotice.addLine(
					`[🔀 Forwarded from #${roomName}]`,
					tag`🔀 <em>Forwarded from <a href="https://matrix.to/#/${room.room_id}/${eventID}?${via}">${roomName}</a></em>`
				)
			} else {
				forwardedNotice.addLine(
					`[🔀 Forwarded from #${roomName}]`,
					tag`🔀 <em>Forwarded from <a href="https://matrix.to/#/${room.room_id}?${via}">${roomName}</a></em>`
				)
			}
		} else {
			forwardedNotice.addLine(
				`[🔀 Forwarded message]`,
				tag`🔀 <em>Forwarded message</em>`
			)
		}

		// Forwarded content
		// @ts-ignore
		const forwardedEvents = await messageToEvent(message.message_snapshots[0].message, guild, {includeReplyFallback: false, includeEditFallbackStar: false, alwaysReturnFormattedBody: true, scanTextForMentions: false}, di)

		// Indent
		for (const event of forwardedEvents) {
			if (["m.text", "m.notice"].includes(event.msgtype)) {
				event.msgtype = "m.notice"
				event.body = event.body.split("\n").map(l => "» " + l).join("\n")
				event.formatted_body = `<blockquote>${event.formatted_body}</blockquote>`
			}
		}

		// Try to merge the forwarded content with the forwarded notice
		let {body, formatted_body} = forwardedNotice.get()
		if (forwardedEvents.length >= 1 && ["m.text", "m.notice"].includes(forwardedEvents[0].msgtype)) { // Try to merge the forwarded content and the forwarded notice
			forwardedEvents[0].body = body + "\n" + forwardedEvents[0].body
			forwardedEvents[0].formatted_body = formatted_body + "<br>" + forwardedEvents[0].formatted_body
		} else {
			await addTextEvent(body, formatted_body, "m.notice")
		}
		events.push(...forwardedEvents)
	}

	// Then text content
	if (message.content) {
		// Mentions scenario 3: scan the message content for written @mentions of matrix users. Allows for up to one space between @ and mention.
		const matches = [...message.content.matchAll(/@ ?([a-z0-9._]+)\b/gi)]
		if (options.scanTextForMentions !== false && matches.length && matches.some(m => m[1].match(/[a-z]/i) && m[1] !== "everyone" && m[1] !== "here")) {
			const writtenMentionsText = matches.map(m => m[1].toLowerCase())
			const roomID = select("channel_room", "room_id", {channel_id: message.channel_id}).pluck().get()
			assert(roomID)
			const {joined} = await di.api.getJoinedMembers(roomID)
			for (const [mxid, member] of Object.entries(joined)) {
				if (!userRegex.some(rx => mxid.match(rx))) {
					const localpart = mxid.match(/@([^:]*)/)
					assert(localpart)
					const displayName = member.display_name || localpart[1]
					if (writtenMentionsText.includes(localpart[1].toLowerCase()) || writtenMentionsText.includes(displayName.toLowerCase())) addMention(mxid)
				}
			}
		}

		const {body, html} = await transformContent(message.content)
		await addTextEvent(body, html, msgtype)
	}

	// Then scheduled events
	if (message.content && di?.snow) {
		for (const match of [...message.content.matchAll(/discord\.gg\/([A-Za-z0-9]+)\?event=([0-9]{18,})/g)]) { // snowflake has minimum 18 because the events feature is at least that old
			const invite = await di.snow.invite.getInvite(match[1], {guild_scheduled_event_id: match[2]})
			const event = invite.guild_scheduled_event
			if (!event) continue // the event ID provided was not valid

			const formatter = new Intl.DateTimeFormat("en-NZ", {month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "shortGeneric", timeZone: reg.ooye.time_zone}) // 9 June at 3:00 pm NZT
			const rep = new mxUtils.MatrixStringBuilder()

			// Add time
			if (event.scheduled_end_time) {
				// @ts-ignore - no definition available for formatRange
				rep.addParagraph(`Scheduled Event - ${formatter.formatRange(new Date(event.scheduled_start_time), new Date(event.scheduled_end_time))}`)
			} else {
				rep.addParagraph(`Scheduled Event - ${formatter.format(new Date(event.scheduled_start_time))}`)
			}

			// Add details
			rep.addLine(`## ${event.name}`, tag`<strong>${event.name}</strong>`)
			if (event.description) rep.addLine(event.description)

			// Add location
			if (event.entity_metadata?.location) {
				rep.addParagraph(`📍 ${event.entity_metadata.location}`)
			} else if (invite.channel?.name) {
				const roomID = select("channel_room", "room_id", {channel_id: invite.channel.id}).pluck().get()
				if (roomID) {
					const via = await getViaServersMemo(roomID)
					rep.addParagraph(`🔊 ${invite.channel.name} - https://matrix.to/#/${roomID}?${via}`, tag`🔊 ${invite.channel.name} - <a href="https://matrix.to/#/${roomID}?${via}">${invite.channel.name}</a>`)
				} else {
					rep.addParagraph(`🔊 ${invite.channel.name}`)
				}
			}

			// Send like an embed
			let {body, formatted_body: html} = rep.get()
			body = body.split("\n").map(l => "| " + l).join("\n")
			html = `<blockquote>${html}</blockquote>`
			await addTextEvent(body, html, "m.notice")
		}
	}

	// Then attachments
	if (message.attachments) {
		const attachmentEvents = await Promise.all(message.attachments.map(attachmentToEvent.bind(null, mentions)))
		events.push(...attachmentEvents)
	}

	// Then embeds
	const urlPreviewEnabled = select("guild_space", "url_preview", {guild_id: guild?.id}).pluck().get() ?? 1
	for (const embed of message.embeds || []) {
		if (!urlPreviewEnabled && !message.author?.bot) {
			continue // show embeds for everyone if enabled, or bot users only if disabled (bots often send content in embeds)
		}

		if (embed.type === "image") {
			continue // Matrix's own URL previews are fine for images.
		}

		if (embed.url?.startsWith("https://discord.com/")) {
			continue // If discord creates an embed preview for a discord channel link, don't copy that embed
		}

		// Start building up a replica ("rep") of the embed in Discord-markdown format, which we will convert into both plaintext and formatted body at once
		const rep = new mxUtils.MatrixStringBuilder()

		// Provider
		if (embed.provider?.name && embed.provider.name !== "Tenor") {
			if (embed.provider.url) {
				rep.addParagraph(`via ${embed.provider.name} ${embed.provider.url}`, tag`<sub><a href="${embed.provider.url}">${embed.provider.name}</a></sub>`)
			} else {
				rep.addParagraph(`via ${embed.provider.name}`, tag`<sub>${embed.provider.name}</sub>`)
			}
		}

		// Author and URL into a paragraph
		let authorNameText = embed.author?.name || ""
		if (authorNameText && embed.author?.icon_url) authorNameText = `⏺️ ${authorNameText}` // using the emoji instead of an image
		if (authorNameText) {
			if (embed.author?.url) {
				const authorURL = await transformContentMessageLinks(embed.author.url)
				rep.addParagraph(`## ${authorNameText} ${authorURL}`, tag`<strong><a href="${authorURL}">${authorNameText}</a></strong>`)
			} else {
				rep.addParagraph(`## ${authorNameText}`, tag`<strong>${authorNameText}</strong>`)
			}
		}

		// Title and URL into a paragraph
		if (embed.title) {
			const {body, html} = await transformContent(embed.title, {}, embedTitleParser, markdown.htmlOutput)
			if (embed.url) {
				rep.addParagraph(`## ${body} ${embed.url}`, tag`<strong><a href="${embed.url}">$${html}</a></strong>`)
			} else {
				rep.addParagraph(`## ${body}`, `<strong>${html}</strong>`)
			}
		}

		let embedTypeShouldShowDescription = embed.type !== "video" // Discord doesn't display descriptions for videos
		if (embed.provider?.name === "YouTube") embedTypeShouldShowDescription = true // But I personally like showing the descriptions for YouTube videos specifically
		if (embed.description && embedTypeShouldShowDescription) {
			const {body, html} = await transformContent(embed.description)
			rep.addParagraph(body, html)
		}

		for (const field of embed.fields || []) {
			const name = field.name.match(/^[\s​­]*$/) ? {body: "", html: ""} : await transformContent(field.name, {}, embedTitleParser, markdown.htmlOutput)
			const value = await transformContent(field.value)
			const fieldRep = new mxUtils.MatrixStringBuilder()
				.addLine(`### ${name.body}`, `<strong>${name.html}</strong>`, name.body)
				.addLine(value.body, value.html, !!value.body)
			rep.addParagraph(fieldRep.get().body, fieldRep.get().formatted_body)
		}

		let chosenImage = embed.image?.url
		// the thumbnail seems to be used for "article" type but displayed big at the bottom by discord
		if (embed.type === "article" && embed.thumbnail?.url && !chosenImage) chosenImage = embed.thumbnail.url
		if (chosenImage) rep.addParagraph(`📸 ${dUtils.getPublicUrlForCdn(chosenImage)}`)

		if (embed.video?.url) rep.addParagraph(`🎞️ ${dUtils.getPublicUrlForCdn(embed.video.url)}`)

		if (embed.footer?.text) rep.addLine(`— ${embed.footer.text}`, tag`— ${embed.footer.text}`)
		let {body, formatted_body: html} = rep.get()
		body = body.split("\n").map(l => "| " + l).join("\n")
		html = `<blockquote>${html}</blockquote>`

		// Send as m.notice to apply the usual automated/subtle appearance, showing this wasn't actually typed by the person
		await addTextEvent(body, html, "m.notice")
	}

	// Then stickers
	if (message.sticker_items) {
		const stickerEvents = await Promise.all(message.sticker_items.map(async stickerItem => {
			const format = file.stickerFormat.get(stickerItem.format_type)
			assert(format?.mime)
			if (format?.mime === "lottie") {
				const {mxc_url, info} = await lottie.convert(stickerItem)
				return {
					$type: "m.sticker",
					"m.mentions": mentions,
					body: stickerItem.name,
					info,
					url: mxc_url
				}
			} else {
				let body = stickerItem.name
				const sticker = guild.stickers.find(sticker => sticker.id === stickerItem.id)
				if (sticker && sticker.description) body += ` - ${sticker.description}`
				return {
					$type: "m.sticker",
					"m.mentions": mentions,
					body,
					info: {
						mimetype: format.mime
					},
					url: await file.uploadDiscordFileToMxc(file.sticker(stickerItem))
				}
			}
		}))
		events.push(...stickerEvents)
	}

	// Rich replies
	if (repliedToEventRow) {
		Object.assign(events[0], {
			"m.relates_to": {
				"m.in_reply_to": {
					event_id: repliedToEventRow.event_id
				}
			}
		})
	}

	return events
}

module.exports.messageToEvent = messageToEvent
