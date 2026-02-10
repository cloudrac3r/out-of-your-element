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
/** @type {import("../../matrix/utils")} */
const mxUtils = sync.require("../../matrix/utils")
/** @type {import("../../discord/utils")} */
const dUtils = sync.require("../../discord/utils")
/** @type {import("./find-mentions")} */
const findMentions = sync.require("./find-mentions")
/** @type {import("../../discord/interactions/poll-responses")} */
const pollResponses = sync.require("../../discord/interactions/poll-responses")
const {reg} = require("../../matrix/read-registration")

/**
 * @param {DiscordTypes.APIMessage} message
 * @param {DiscordTypes.APIGuild} guild
 * @param {boolean} useHTML
 * @param {string[]} spoilers
 */
function getDiscordParseCallbacks(message, guild, useHTML, spoilers = []) {
	return {
		/** @param {{id: string, type: "discordUser"}} node */
		user: node => {
			const mxid = select("sim", "mxid", {user_id: node.id}).pluck().get()
			const interaction = message.interaction_metadata || message.interaction
			const username = message.mentions?.find(ment => ment.id === node.id)?.username
				|| message.referenced_message?.mentions?.find(ment => ment.id === node.id)?.username
				|| (interaction?.user.id === node.id ? interaction.user.username : null)
				|| (message.author?.id === node.id ? message.author.username : null)
				|| "unknown-user"
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
		},
		spoiler: node => {
			spoilers.push(node.raw)
			return useHTML
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
 * @param {Omit<DiscordTypes.APIAttachment, "id" | "proxy_url">} attachment
 * @param {boolean} [alwaysLink]
 */
async function attachmentToEvent(mentions, attachment, alwaysLink) {
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
	else if (alwaysLink || attachment.size > reg.ooye.max_file_size) {
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
				duration: attachment.duration_secs && Math.round(attachment.duration_secs * 1000)
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

/** @param {DiscordTypes.APIPoll} poll */
async function pollToEvent(poll) {
	let fallbackText = poll.question.text
	if (poll.allow_multiselect) {
		var maxSelections = poll.answers.length;
	} else {
		var maxSelections = 1;
	}
	let answers = poll.answers.map(answer=>{
		let matrixText = answer.poll_media.text
		if (answer.poll_media.emoji) {
			if (answer.poll_media.emoji.id) {
				// Custom emoji. It seems like no Matrix client allows custom emoji in poll answers, so leaving this unimplemented.
			} else {
				matrixText = "[" + answer.poll_media.emoji.name + "] " + matrixText
			}
		}
		let matrixAnswer = {
			id: answer.answer_id.toString(),
			"org.matrix.msc1767.text": matrixText
		}
		fallbackText = fallbackText + "\n" + answer.answer_id.toString() + ". " + matrixText
		return matrixAnswer;
	})
	return {
		/** @type {"org.matrix.msc3381.poll.start"} */
		$type: "org.matrix.msc3381.poll.start",
		"org.matrix.msc3381.poll.start": {
			question: {
				"org.matrix.msc1767.text": poll.question.text,
				body: poll.question.text,
				msgtype: "m.text"
			},
			kind: "org.matrix.msc3381.poll.disclosed", // Discord always lets you see results, so keeping this consistent with that.
			max_selections: maxSelections,
			answers: answers
		},
		"org.matrix.msc1767.text": fallbackText
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
	message = {...message}
	const events = []

	/* c8 ignore next 7 */
	if (message.type === DiscordTypes.MessageType.ThreadCreated) {
		// This is the kind of message that appears when somebody makes a thread which isn't close enough to the message it's based off.
		// It lacks the lines and the pill, so it looks kind of like a member join message, and it says:
		// [#] NICKNAME started a thread: __THREAD NAME__. __See all threads__
		// We're already bridging the THREAD_CREATED gateway event to make a comparable message, so drop this one.
		return []
	}

	if (message.type === DiscordTypes.MessageType.PollResult) {
		const pollMessageID = message.message_reference?.message_id
		if (!pollMessageID) return []
		const event_id = select("event_message", "event_id", {message_id: pollMessageID}).pluck().get()
		const roomID = select("channel_room", "room_id", {channel_id: message.channel_id}).pluck().get()
		const pollQuestionText = select("poll", "question_text", {message_id: pollMessageID}).pluck().get()
		if (!event_id || !roomID || !pollQuestionText) return [] // drop it if the corresponding poll start was not bridged

		const rep = new mxUtils.MatrixStringBuilder()
		rep.addLine(`The poll ${pollQuestionText} has closed.`, tag`The poll <a href="https://matrix.to/#/${roomID}/${event_id}">${pollQuestionText}</a> has closed.`)

		const {messageString} = pollResponses.getCombinedResults(pollMessageID, true) // poll results have already been double-checked before this point, so these totals will be accurate
		rep.addLine(markdown.toHTML(messageString, {discordOnly: true, escapeHTML: false}), markdown.toHTML(messageString, {}))

		const {body, formatted_body} = rep.get()

		return [{
			$type: "org.matrix.msc3381.poll.end",
			"m.relates_to": {
				rel_type: "m.reference",
				event_id
			},
			"org.matrix.msc3381.poll.end": {},
			"org.matrix.msc1767.text": body,
			"org.matrix.msc1767.html": formatted_body,
			body: body,
			format: "org.matrix.custom.html",
			formatted_body: formatted_body,
			msgtype: "m.text"
		}]
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
		message.content = `> ↪️ <@${interaction.user.id}> used \`/${interaction.name}\`${content}`
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
	/** @type {{event_id: string, room_id: string, source: number, channel_id: string}?} */
	let repliedToEventRow = null
	let repliedToEventInDifferentRoom = false
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
		const row = await getHistoricalEventRow(message.message_reference?.message_id)
		if (row && "event_id" in row) {
			repliedToEventRow = Object.assign(row, {channel_id: row.reference_channel_id})
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
				const row = await getHistoricalEventRow(match[1])
				if (row && "event_id" in row) {
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
					repliedToEventRow = Object.assign(row, {channel_id: row.reference_channel_id})
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
	 * @param {string} messageID
	 * @param {string} [timestampChannelID]
	 */
	async function getHistoricalEventRow(messageID, timestampChannelID) {
		/** @type {{room_id: string} | {event_id: string, room_id: string, reference_channel_id: string, source: number} | null} */
		let row = from("event_message").join("message_room", "message_id").join("historical_channel_room", "historical_room_index")
			.select("event_id", "room_id", "reference_channel_id", "source").where({message_id: messageID}).and("ORDER BY part ASC").get()
		if (!row && timestampChannelID) {
			const ts = dUtils.snowflakeToTimestampExact(messageID)
			const oldestRow = from("historical_channel_room").selectUnsafe("max(upgraded_timestamp)", "room_id")
				.where({reference_channel_id: timestampChannelID}).and("and upgraded_timestamp < ?").get(ts)
			if (oldestRow?.room_id) {
				row = {room_id: oldestRow.room_id}
				try {
					const {event_id} = await di.api.getEventForTimestamp(oldestRow.room_id, ts)
					row = {
						event_id,
						room_id: oldestRow.room_id,
						reference_channel_id: oldestRow.reference_channel_id,
						source: 1
					}
				} catch (e) {}
			}
		}
		return row
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
			const result = await (async () => {
				const row = await getHistoricalEventRow(messageID, channelID)
				if (!row) return `${match[0]} [event is from another server]`
				const via = await getViaServersMemo(row.room_id)
				if (!("event_id" in row)) return `[unknown event in https://matrix.to/#/${row.room_id}?${via}]`
				return `https://matrix.to/#/${row.room_id}/${row.event_id}?${via}`
			})()

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

	const spoilers = []
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

		// Remove smalltext from non-bots (I don't like it). Webhooks included due to PluralKit.
		const isHumanOrDataMissing = !message.author?.bot
		if (isHumanOrDataMissing || dUtils.isWebhookMessage(message)) {
			content = content.replaceAll(/^-# +([^\n].*?)/gm, "...$1")
		}

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
			discordCallback: getDiscordParseCallbacks(message, guild, true, spoilers),
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
		// Generate a fallback if native replies are unsupported, which is in the following situations:
		//   1. The replied-to event is in a different room to where the reply will be sent (i.e. a room upgrade occurred between)
		//   2. The replied-to message has no corresponding Matrix event (repliedToUnknownEvent is true)
		// This branch is optional - do NOT change anything apart from the reply fallback, since it may not be run
		if ((repliedToEventRow || repliedToUnknownEvent) && options.includeReplyFallback !== false && events.length === 0) {
			const latestRoomID = repliedToEventRow ? select("channel_room", "room_id", {channel_id: repliedToEventRow.channel_id}).pluck().get() : null
			if (latestRoomID !== repliedToEventRow?.room_id) repliedToEventInDifferentRoom = true

			// check that condition 1 or 2 is met
			if (repliedToEventInDifferentRoom || repliedToUnknownEvent) {
				let referenced = message.referenced_message
				if (!referenced) { // backend couldn't be bothered to dereference the message, have to do it ourselves
					referenced = await discord.snow.channel.getChannelMessage(message.message_reference.channel_id, message.message_reference.message_id)
				}

				// Username
				let repliedToDisplayName
				let repliedToUserHtml
				if (repliedToEventRow?.source === 0 && repliedToEventSenderMxid) {
					const match = repliedToEventSenderMxid.match(/^@([^:]*)/)
					assert(match)
					repliedToDisplayName = referenced.author.username || match[1] || "a Matrix user" // grab the localpart as the display name, whatever
					repliedToUserHtml = `<a href="https://matrix.to/#/${repliedToEventSenderMxid}">${repliedToDisplayName}</a>`
				} else {
					repliedToDisplayName = referenced.author.global_name || referenced.author.username || "a Discord user"
					repliedToUserHtml = repliedToDisplayName
				}

				// Content
				let repliedToContent = referenced.content
				if (repliedToContent?.match(/^(-# )?> (-# )?<?:L1:/)) {
					// If the Discord user is replying to a Matrix user's reply, the fallback is going to contain the emojis and stuff from the bridged rep of the Matrix user's reply quote.
					// Need to remove that previous reply rep from this fallback body. The fallbody body should only contain the Matrix user's actual message.
					//                                            ┌──────A─────┐       A reply rep starting with >quote or -#smalltext >quote. Match until the end of the line.
					//                                            ┆            ┆┌─B─┐  There may be up to 2 reply rep lines in a row if it was created in the old format. Match all lines.
					repliedToContent = repliedToContent.replace(/^((-# )?> .*\n){1,2}/, "")
				}
				if (repliedToContent == "") repliedToContent = "[Media]"
				const {body: repliedToBody, html: repliedToHtml} = await transformContent(repliedToContent)

				// Now branch on condition 1 or 2 for a different kind of fallback
				if (repliedToEventRow) {
					html = `<blockquote><a href="https://matrix.to/#/${repliedToEventRow.room_id}/${repliedToEventRow.event_id}">In reply to</a> ${repliedToUserHtml}`
						+ `<br>${repliedToHtml}</blockquote>`
						+ html
					body = `${repliedToDisplayName}: ${repliedToBody}`.split("\n").map(line => "> " + line).join("\n") // scenario 1 part B for mentions
						+ "\n\n" + body
				} else { // repliedToUnknownEvent
					const dateDisplay = dUtils.howOldUnbridgedMessage(referenced.timestamp, message.timestamp)
					html = `<blockquote>In reply to ${dateDisplay} from ${repliedToDisplayName}:`
						+ `<br>${repliedToHtml}</blockquote>`
						+ html
					body = `In reply to ${dateDisplay}:\n${repliedToDisplayName}: ${repliedToBody}`.split("\n").map(line => "> " + line).join("\n")
						+ "\n\n" + body
				}
			}
		}

		const newTextMessageEvent = {
			$type: "m.room.message",
			"m.mentions": mentions,
			msgtype,
			body: body,
			format: "org.matrix.custom.html",
			formatted_body: html
		}

		events.push(newTextMessageEvent)
	}


	let msgtype = "m.text"
	// Handle message type 4, channel name changed
	if (message.type === DiscordTypes.MessageType.ChannelNameChange) {
		msgtype = "m.emote"
		message.content = "changed the channel name to **" + message.content + "**"
	}

	// Handle message type 63, new emoji announcement
	// @ts-expect-error - should be changed to a DiscordTypes reference once it has been documented
	if (message.type === 63) {
		const match = message.content.match(/^<(a?):([^:>]{1,64}):([0-9]+)>$/)
		assert(match, `message type 63, which announces a new emoji, did not include an emoji. the actual content was: "${message.content}"`)
		const name = match[2]
		msgtype = "m.emote"
		message.content = `added a new emoji, ${message.content} :${name}:`
	}

	// Send Klipy GIFs in customised form
	let isKlipyGIF = false
	let isOnlyKlipyGIF = false
	if (message.embeds?.length === 1 && message.embeds[0].provider?.name === "Klipy" && message.embeds[0].video?.url) {
		isKlipyGIF = true
		if (message.content.match(/^https?:\/\/klipy\.com[^ \n]+$/)) {
			isOnlyKlipyGIF = true
		}
	}

	// Forwarded content appears first
	if (message.message_reference?.type === DiscordTypes.MessageReferenceType.Forward && message.message_snapshots?.length) {
		// Forwarded notice
		const row = await getHistoricalEventRow(message.message_reference.message_id, message.message_reference.channel_id)
		const room = select("channel_room", ["room_id", "name", "nick"], {channel_id: message.message_reference.channel_id}).get()
		const forwardedNotice = new mxUtils.MatrixStringBuilder()
		if (room) {
			const roomName = room && (room.nick || room.name)
			if ("event_id" in row) {
				const via = await getViaServersMemo(row.room_id)
				forwardedNotice.addLine(
					`[🔀 Forwarded from #${roomName}]`,
					tag`🔀 <em>Forwarded from ${roomName} <a href="https://matrix.to/#/${room.room_id}/${row.event_id}?${via}">[jump to event]</a></em>`
				)
			} else {
				const via = await getViaServersMemo(room.room_id)
				forwardedNotice.addLine(
					`[🔀 Forwarded from #${roomName}]`,
					tag`🔀 <em>Forwarded from ${roomName} <a href="https://matrix.to/#/${room.room_id}?${via}">[jump to room]</a></em>`
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
	if (message.content && !isOnlyKlipyGIF) {
		// Mentions scenario 3: scan the message content for written @mentions of matrix users. Allows for up to one space between @ and mention.
		let content = message.content
		if (options.scanTextForMentions !== false) {
			const matches = [...content.matchAll(/(@ ?)([a-z0-9_.#$][^@\n]+)/gi)]
			for (let i = matches.length; i--;) {
				const m = matches[i]
				const prefix = m[1]
				const maximumWrittenSection = m[2].toLowerCase()
				if (m.index > 0 && !content[m.index-1].match(/ |\(|\n/)) continue // must have space before it
				if (maximumWrittenSection.match(/^everyone\b/) || maximumWrittenSection.match(/^here\b/)) continue // ignore @everyone/@here

				var roomID = roomID ?? select("channel_room", "room_id", {channel_id: message.channel_id}).pluck().get()
				assert(roomID)
				var pjr = pjr ?? findMentions.processJoined(Object.entries((await di.api.getJoinedMembers(roomID)).joined).map(([mxid, ev]) => ({mxid, displayname: ev.display_name})))

				const found = findMentions.findMention(pjr, maximumWrittenSection, m.index, prefix, content)
				if (found) {
					addMention(found.mxid)
					content = found.newContent
				}
			}
		}

		const {body, html} = await transformContent(content)
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
		const attachmentEvents = await Promise.all(message.attachments.map(attachment => attachmentToEvent(mentions, attachment)))

		// Try to merge attachment events with the previous event
		// This means that if the attachments ended up as a text link, and especially if there were many of them, the events will be joined together.
		let prev = events.at(-1)
		for (const atch of attachmentEvents) {
			if (atch.msgtype === "m.text" && prev?.body && prev?.formatted_body && ["m.text", "m.notice"].includes(prev?.msgtype)) {
				prev.body = prev.body + "\n" + atch.body
				prev.formatted_body = prev.formatted_body + "<br>" + atch.formatted_body
			} else {
				events.push(atch)
			}
		}
	}

	// Then components
	if (message.components?.length) {
		const stack = [new mxUtils.MatrixStringBuilder()]
		/** @param {DiscordTypes.APIMessageComponent} component */
		async function processComponent(component) {
			// Standalone components
			if (component.type === DiscordTypes.ComponentType.TextDisplay) {
				const {body, html} = await transformContent(component.content)
				stack[0].addParagraph(body, html)
			}
			else if (component.type === DiscordTypes.ComponentType.Separator) {
				stack[0].addParagraph("----", "<hr>")
			}
			else if (component.type === DiscordTypes.ComponentType.File) {
				const ev = await attachmentToEvent({}, {...component.file, filename: component.name, size: component.size}, true)
				stack[0].addLine(ev.body, ev.formatted_body)
			}
			else if (component.type === DiscordTypes.ComponentType.MediaGallery) {
				const description = component.items.length === 1 ? component.items[0].description || "Image:" : "Image gallery:"
				const images = component.items.map(item => {
					const publicURL = dUtils.getPublicUrlForCdn(item.media.url)
					return {
						url: publicURL,
						estimatedName: item.media.url.match(/\/([^/?]+)(\?|$)/)?.[1] || publicURL
					}
				})
				stack[0].addLine(`🖼️ ${description} ${images.map(i => i.url).join(", ")}`, tag`🖼️ ${description} $${images.map(i => tag`<a href="${i.url}">${i.estimatedName}</a>`).join(", ")}`)
			}
			// string select, text input, user select, role select, mentionable select, channel select

			// Components that can have things nested
			else if (component.type === DiscordTypes.ComponentType.Container) {
				// May contain action row, text display, section, media gallery, separator, file
				stack.unshift(new mxUtils.MatrixStringBuilder())
				for (const innerComponent of component.components) {
					await processComponent(innerComponent)
				}
				let {body, formatted_body} = stack.shift().get()
				body = body.split("\n").map(l => "| " + l).join("\n")
				formatted_body = `<blockquote>${formatted_body}</blockquote>`
				if (stack[0].body) stack[0].body += "\n\n"
				stack[0].add(body, formatted_body)
			}
			else if (component.type === DiscordTypes.ComponentType.Section) {
				// May contain text display, possibly more in the future
				// Accessory may be button or thumbnail
				stack.unshift(new mxUtils.MatrixStringBuilder())
				for (const innerComponent of component.components) {
					await processComponent(innerComponent)
				}
				if (component.accessory) {
					stack.unshift(new mxUtils.MatrixStringBuilder())
					await processComponent(component.accessory)
					const {body, formatted_body} = stack.shift().get()
					stack[0].addLine(body, formatted_body)
				}
				const {body, formatted_body} = stack.shift().get()
				stack[0].addParagraph(body, formatted_body)
			}
			else if (component.type === DiscordTypes.ComponentType.ActionRow) {
				const linkButtons = component.components.filter(c => c.type === DiscordTypes.ComponentType.Button && c.style === DiscordTypes.ButtonStyle.Link)
				if (linkButtons.length) {
					stack[0].addLine("")
					for (const linkButton of linkButtons) {
						await processComponent(linkButton)
					}
				}
			}
			// Components that can only be inside things
			else if (component.type === DiscordTypes.ComponentType.Thumbnail) {
				// May only be a section accessory
				stack[0].add(`🖼️ ${component.media.url}`, tag`🖼️ <a href="${component.media.url}">${component.media.url}</a>`)
			}
			else if (component.type === DiscordTypes.ComponentType.Button) {
				// May only be a section accessory or in an action row (up to 5)
				if (component.style === DiscordTypes.ButtonStyle.Link) {
					if (component.label) {
						stack[0].add(`[${component.label} ${component.url}] `, tag`<a href="${component.url}">${component.label}</a> `)
					} else {
						stack[0].add(component.url)
					}
				}
			}

			// Not handling file upload or label because they are modal-only components
		}

		for (const component of message.components) {
			await processComponent(component)
		}

		const {body, formatted_body} = stack[0].get()
		if (body.trim().length) {
			await addTextEvent(body, formatted_body, "m.text")
		}
	}

	// Then polls
	if (message.poll) {
		const pollEvent = await pollToEvent(message.poll)
		events.push(pollEvent)
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

		if (embed.type === "video" && !embed.title && message.content.includes(embed.video?.url)) {
			continue // Doesn't add extra information and the direct video URL is already there.
		}

		if (embed.type === "poll_result") {
			// The code here is only for the message to be bridged to Matrix. Dealing with the Discord-side updates is in d2m/actions/poll-end.js.
		}

		if (embed.url?.startsWith("https://discord.com/")) {
			continue // If discord creates an embed preview for a discord channel link, don't copy that embed
		}

		if (embed.url && spoilers.some(sp => sp.match(/\bhttps?:\/\/[a-z]/))) {
			// If the original message had spoilered URLs, don't generate any embeds for links.
			// This logic is the same as the Discord desktop client. It doesn't match specific embeds to specific spoilered text, it's all or nothing.
			// It's not easy to do much better because posting a link like youtu.be generates an embed.url with youtube.com/watch, so you can't match up the text without making at least that a special case.
			continue
		}

		// Start building up a replica ("rep") of the embed in Discord-markdown format, which we will convert into both plaintext and formatted body at once
		const rep = new mxUtils.MatrixStringBuilder()

		if (isKlipyGIF) {
			rep.add("[GIF] ", "➿ ")
			if (embed.title) {
				rep.add(`${embed.title} ${embed.video.url}`, tag`<a href="${embed.video.url}">${embed.title}</a>`)
			} else {
				rep.add(embed.video.url)
			}

			let {body, formatted_body: html} = rep.get()
			html = `<blockquote>${html}</blockquote>`
			await addTextEvent(body, html, "m.text")
			continue
		}

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
	if (repliedToEventRow && !repliedToEventInDifferentRoom) {
		Object.assign(events[0], {
			"m.relates_to": {
				"m.in_reply_to": {
					event_id: repliedToEventRow.event_id
				}
			}
		})
	}

	// Strip formatted_body where equivalent to body
	if (!options.alwaysReturnFormattedBody) {
		for (const event of events) {
			if (event.$type === "m.room.message" && "msgtype" in event && ["m.text", "m.notice"].includes(event.msgtype) && event.body === event.formatted_body) {
				delete event.format
				delete event.formatted_body
			}
		}
	}

	return events
}

module.exports.messageToEvent = messageToEvent
