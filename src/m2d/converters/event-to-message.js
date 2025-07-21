// @ts-check

const Ty = require("../../types")
const DiscordTypes = require("discord-api-types/v10")
const stream = require("stream")
const chunk = require("chunk-text")
const TurndownService = require("@cloudrac3r/turndown")
const domino = require("domino")
const assert = require("assert").strict
const entities = require("entities")

const passthrough = require("../../passthrough")
const {sync, db, discord, select, from} = passthrough
/** @type {import("../converters/utils")} */
const mxUtils = sync.require("../converters/utils")
/** @type {import("../../discord/utils")} */
const dUtils = sync.require("../../discord/utils")
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")
/** @type {import("./emoji-sheet")} */
const emojiSheet = sync.require("./emoji-sheet")
/** @type {import("../actions/setup-emojis")} */
const setupEmojis = sync.require("../actions/setup-emojis")

/** @type {[RegExp, string][]} */
const markdownEscapes = [
	[/\\/g, '\\\\'],
	[/\*/g, '\\*'],
	[/^-/g, '\\-'],
	[/^\+ /g, '\\+ '],
	[/^(=+)/g, '\\$1'],
	[/^(#{1,6}) /g, '\\$1 '],
	[/`/g, '\\`'],
	[/^~~~/g, '\\~~~'],
	[/\[/g, '\\['],
	[/\]/g, '\\]'],
	[/^>/g, '\\>'],
	[/_/g, '\\_'],
	[/^(\d+)\. /g, '$1\\. ']
	/*
		Strikethrough is deliberately not escaped. Usually when Matrix users type ~~ it's not because they wanted to send ~~,
		it's because they wanted strikethrough and it didn't work because their client doesn't support it.
		As bridge developers, we can choose between "messages should look as similar as possible" vs "it was most likely intended to be strikethrough".
		I went with the latter. Even though the appearance doesn't match, I'd rather it displayed as originally intended for 80% of the readers than for 0%.
	*/
]

const turndownService = new TurndownService({
	hr: "----",
	headingStyle: "atx",
	preformattedCode: true,
	codeBlockStyle: "fenced"
})

/**
 * Markdown characters in the HTML content need to be escaped, though take care not to escape the middle of bare links
 * @param {string} string
 */
// @ts-ignore bad type from turndown
turndownService.escape = function (string) {
	return string.replace(/\s+|\S+/g, part => { // match chunks of spaces or non-spaces
		if (part.match(/\s/)) return part // don't process spaces

		if (part.match(/^https?:\/\//)) {
			return part
		} else {
			return markdownEscapes.reduce(function (accumulator, escape) {
				return accumulator.replace(escape[0], escape[1])
			}, part)
		}
	})
}

turndownService.remove("mx-reply")

turndownService.addRule("strikethrough", {
	filter: ["del", "s"],
	replacement: function (content) {
		return "~~" + content + "~~"
	}
})

turndownService.addRule("underline", {
	filter: ["u"],
	replacement: function (content) {
		return "__" + content + "__"
	}
})

turndownService.addRule("blockquote", {
	filter: "blockquote",
	replacement: function (content) {
		content = content.replace(/^\n+|\n+$/g, "")
		content = content.replace(/^/gm, "> ")
		return content
	}
})

turndownService.addRule("spoiler", {
	filter: function (node, options) {
		return node.tagName === "SPAN" && node.hasAttribute("data-mx-spoiler")
	},

	replacement: function (content, node) {
		if (node.getAttribute("data-mx-spoiler")) {
			// escape parentheses so it can't become a link
			return `\\(${node.getAttribute("data-mx-spoiler")}\\) ||${content}||`
		}
		return `||${content}||`
	}
})

turndownService.addRule("inlineLink", {
	filter: function (node, options) {
		return (
			node.nodeName === "A" &&
			node.getAttribute("href")
		)
	},

	replacement: function (content, node) {
		if (node.getAttribute("data-user-id")) {
			const user_id = node.getAttribute("data-user-id")
			const row = select("sim_proxy", ["displayname", "proxy_owner_id"], {user_id}).get()
			if (row) {
				return `**@${row.displayname}** (<@${row.proxy_owner_id}>)`
			} else {
				return `<@${user_id}>`
			}
		}
		if (node.getAttribute("data-message-id")) return `https://discord.com/channels/${node.getAttribute("data-guild-id")}/${node.getAttribute("data-channel-id")}/${node.getAttribute("data-message-id")}`
		if (node.getAttribute("data-channel-id")) return `<#${node.getAttribute("data-channel-id")}>`
		const href = node.getAttribute("href")
		content = content.replace(/ @.*/, "")
		if (href === content) return href
		if (decodeURIComponent(href).startsWith("https://matrix.to/#/@") && content[0] !== "@") content = "@" + content
		return "[" + content + "](" + href + ")"
	}
})

turndownService.addRule("listItem", {
	filter: "li",
	replacement: function (content, node, options) {
		content = content
		.replace(/^\n+/, "") // remove leading newlines
		.replace(/\n+$/, "\n") // replace trailing newlines with just a single one
		.replace(/\n/gm, "\n  ") // indent
		var prefix = options.bulletListMarker + " "
		var parent = node.parentNode
		if (parent.nodeName === "OL") {
			var start = parent.getAttribute("start")
			var index = Array.prototype.indexOf.call(parent.children, node)
			prefix = (start ? Number(start) + index : index + 1) + ". "
		}
		return prefix + content + (node.nextSibling && !/\n$/.test(content) ? "\n" : "")
	}
})

turndownService.addRule("table", {
	filter: "table",
	replacement: function (content, node, options) {
		const trs = node.querySelectorAll("tr").cache
		/** @type {{text: string, tag: string}[][]} */
		const tableText = trs.map(tr => [...tr.querySelectorAll("th, td")].map(cell => ({text: cell.textContent, tag: cell.tagName})))
		const tableTextByColumn = tableText[0].map((col, i) => tableText.map(row => row[i]))
		const columnWidths = tableTextByColumn.map(col => Math.max(...col.map(cell => cell.text.length)))
		const resultRows = tableText.map((row, rowIndex) =>
			row.map((cell, colIndex) =>
				cell.text.padEnd(columnWidths[colIndex])
			).join("  ")
		)
		const tableHasHeader = tableText[0].slice(1).some(cell => cell.tag === "TH")
		if (tableHasHeader) {
			resultRows.splice(1, 0, "-".repeat(columnWidths.reduce((a, c) => a + c + 2)))
		}
		return "```\n" + resultRows.join("\n") + "```"
	}
})

/** @type {string[]} SPRITE SHEET EMOJIS FEATURE: mxc urls for the currently processing message */
let endOfMessageEmojis = []
turndownService.addRule("emoji", {
	filter: function (node, options) {
		if (node.nodeName !== "IMG" || !node.hasAttribute("data-mx-emoticon") || !node.getAttribute("src") || !node.getAttribute("title")) return false
		return true
	},

	replacement: function (content, node) {
		const mxcUrl = node.getAttribute("src")
		const guessedName = node.getAttribute("title").replace(/^:|:$/g, "")
		return convertEmoji(mxcUrl, guessedName, true, true)
	}
})

turndownService.addRule("fencedCodeBlock", {
	filter: function (node, options) {
		return (
			options.codeBlockStyle === "fenced" &&
			node.nodeName === "PRE" &&
			node.firstChild &&
			node.firstChild.nodeName === "CODE"
		)
	},
	replacement: function (content, node, options) {
		const className = node.firstChild.getAttribute("class") || ""
		const language = (className.match(/language-(\S+)/) || [null, ""])[1]
		const code = node.firstChild
		const visibleCode = getCodeContent(code)

		var fence = "```"

		return (
			fence + language + "\n" +
			visibleCode +
			"\n" + fence
		)
	}
})

/** @param {{ childNodes: Node[]; }} preCode the <code> directly inside the <pre> */
function getCodeContent(preCode) {
	return preCode.childNodes.map(c => c.nodeName === "BR" ? "\n" : c.textContent).join("").replace(/\n*$/g, "")
}

/**
 * @param {string | null} mxcUrl
 * @param {string | null} nameForGuess without colons
 * @param {boolean} allowSpriteSheetIndicator
 * @param {boolean} allowLink
 * @returns {string} discord markdown that represents the custom emoji in some form
 */
function convertEmoji(mxcUrl, nameForGuess, allowSpriteSheetIndicator, allowLink) {
	// Get the known emoji from the database.
	if (mxcUrl) var row = select("emoji", ["emoji_id", "name", "animated"], {mxc_url: mxcUrl}).get()
	// Now we have to search all servers to see if we're able to send this emoji.
	if (row) {
		const found = [...discord.guilds.values()].find(g => g.emojis.find(e => e.id === row?.emoji_id))
		if (!found) row = null
	}
	// Or, if we don't have an emoji right now, we search for the name instead.
	if (!row && nameForGuess) {
		const nameForGuessLower = nameForGuess.toLowerCase()
		for (const guild of discord.guilds.values()) {
			/** @type {{name: string, id: string, animated: number}[]} */
			// @ts-ignore
			const emojis = guild.emojis
			const found = emojis.find(e => e.name?.toLowerCase() === nameForGuessLower)
			if (found) {
				row = {
					animated: found.animated,
					emoji_id: found.id,
					name: found.name
				}
				break
			}
		}
	}
	if (row) {
		// We know an emoji, and we can use it
		const animatedChar = row.animated ? "a" : ""
		return `<${animatedChar}:${row.name}:${row.emoji_id}>`
	} else if (allowSpriteSheetIndicator && mxcUrl && endOfMessageEmojis.includes(mxcUrl)) {
		// We can't locate or use a suitable emoji. After control returns, it will rewind over this, delete this section, and upload the emojis as a sprite sheet.
		return `<::>`
	} else if (allowLink && mxcUrl && nameForGuess) {
		// We prefer not to upload this as a sprite sheet because the emoji is not at the end of the message, it is in the middle.
		return `[:${nameForGuess}:](${mxUtils.getPublicUrlForMxc(mxcUrl)})`
	} else if (nameForGuess) {
		return `:${nameForGuess}:`
	} else {
		return ""
	}
}

/**
 * @param {string} roomID
 * @param {string} mxid
 * @returns {Promise<{displayname?: string?, avatar_url?: string?}>}
 */
async function getMemberFromCacheOrHomeserver(roomID, mxid, api) {
	const row = select("member_cache", ["displayname", "avatar_url"], {room_id: roomID, mxid}).get()
	if (row) return row
	return api.getStateEvent(roomID, "m.room.member", mxid).then(event => {
		const room = select("channel_room", "room_id", {room_id: roomID}).get()
		if (room) {
			// save the member to the cache so we don't have to check with the homeserver next time
			// the cache will be kept in sync by the `m.room.member` event listener
			const displayname = event?.displayname || null
			const avatar_url = event?.avatar_url || null
			db.prepare("INSERT INTO member_cache (room_id, mxid, displayname, avatar_url) VALUES (?, ?, ?, ?) ON CONFLICT DO UPDATE SET displayname = ?, avatar_url = ?").run(
				roomID, mxid,
				displayname, avatar_url,
				displayname, avatar_url
			)
		}
		return event
	}).catch(() => {
		return {displayname: null, avatar_url: null}
	})
}

/**
 * Splits a display name into one chunk containing <=80 characters (80 being how many characters Discord allows for the name of a webhook),
 * and another chunk containing the rest of the characters. Splits on whitespace if possible.
 * These chunks, respectively, go in the display name, and at the top of the message.
 * If the second part isn't empty, it'll also contain boldening markdown and a line break at the end, so that regardless of its value it
 * can be prepended to the message content as-is.
 * @summary Splits too-long Matrix names into a display name chunk and a message content chunk.
 * @param  {string} displayName - The Matrix side display name to chop up.
 * @returns {[string, string]} [shortened display name, display name runoff]
 */
function splitDisplayName(displayName) {
	/** @type {string[]} */
	let displayNameChunks = chunk(displayName, 80)

	if (displayNameChunks.length === 1) {
		return [displayName, ""]
	} else {
		const displayNamePreRunoff = displayNameChunks[0]
		// displayNameRunoff is a slice of the original rather than a concatenation of the rest of the chunks in order to preserve whatever whitespace it was broken on.
		const displayNameRunoff = `**${displayName.slice(displayNamePreRunoff.length + 1)}**\n`

		return [displayNamePreRunoff, displayNameRunoff]
	}
}

/**
 * Convert a Matrix user ID into a Discord user ID for mentioning, where if the user is a PK proxy, it will mention the proxy owner.
 * @param {string} mxid
 */
function getUserOrProxyOwnerID(mxid) {
	const row = from("sim").join("sim_proxy", "user_id", "left").select("user_id", "proxy_owner_id").where({mxid}).get()
	if (!row) return null
	return row.proxy_owner_id || row.user_id
}

/**
 * At the time of this executing, we know what the end of message emojis are, and we know that at least one of them is unknown.
 * This function will strip them from the content and generate the correct pending file of the sprite sheet.
 * @param {string} content
 * @param {{id: string, filename: string}[]} attachments
 * @param {({name: string, mxc: string} | {name: string, mxc: string, key: string, iv: string} | {name: string, buffer: Buffer})[]} pendingFiles
 * @param {(mxc: string) => Promise<Buffer | undefined>} mxcDownloader function that will download the mxc URLs and convert to uncompressed PNG data. use `getAndConvertEmoji` or a mock.
 */
async function uploadEndOfMessageSpriteSheet(content, attachments, pendingFiles, mxcDownloader) {
	if (!content.includes("<::>")) return content // No unknown emojis, nothing to do
	// Remove known and unknown emojis from the end of the message
	const r = /<a?:[a-zA-Z0-9_]*:[0-9]*>\s*$/
	while (content.match(r)) {
		content = content.replace(r, "")
	}
	// Create a sprite sheet of known and unknown emojis from the end of the message
	const buffer = await emojiSheet.compositeMatrixEmojis(endOfMessageEmojis, mxcDownloader)
	// Attach it
	const filename = "emojis.png"
	attachments.push({id: String(attachments.length), filename})
	pendingFiles.push({name: filename, buffer})
	return content
}

/**
 * @param {string} input
 * @param {{api: import("../../matrix/api")}} di simple-as-nails dependency injection for the matrix API
 */
async function handleRoomOrMessageLinks(input, di) {
	let offset = 0
	for (const match of [...input.matchAll(/("?https:\/\/matrix.to\/#\/((?:#|%23|!)[^"/, ?)]+)(?:\/(\$[^"/ ?)]+))?(?:\?[^",:!? )]*?)?)(">|[,<\n )]|$)/g)]) {
		assert(typeof match.index === "number")
		let [_, attributeValue, roomID, eventID, endMarker] = match
		let result

		const resultType = endMarker === '">' ? "html" : "plain"
		const MAKE_RESULT = {
			ROOM_LINK: {
				html: channelID => `${attributeValue}" data-channel-id="${channelID}">`,
				plain: channelID => `<#${channelID}>${endMarker}`
			},
			MESSAGE_LINK: {
				html: (guildID, channelID, messageID) => `${attributeValue}" data-channel-id="${channelID}" data-guild-id="${guildID}" data-message-id="${messageID}">`,
				plain: (guildID, channelID, messageID) => `https://discord.com/channels/${guildID}/${channelID}/${messageID}${endMarker}`
			}
		}

		// Don't process links that are part of the reply fallback, they'll be removed entirely by turndown
		if (input.slice(match.index + match[0].length + offset).startsWith("In reply to")) continue

		// Resolve room alias to room ID if needed
		roomID = decodeURIComponent(roomID)
		if (roomID[0] === "#") {
			try {
				roomID = await di.api.getAlias(roomID)
			} catch (e) {
				continue // Room alias is unresolvable, so it can't be converted
			}
		}

		const channelID = select("channel_room", "channel_id", {room_id: roomID}).pluck().get()
		if (!channelID) continue
		if (!eventID) {
			// 1: It's a room link, so <#link> to the channel
			result = MAKE_RESULT.ROOM_LINK[resultType](channelID)
		} else {
			// Linking to a particular event with a discord.com/channels/guildID/channelID/messageID link
			// Need to know the guildID and messageID
			const guildID = discord.channels.get(channelID)?.["guild_id"]
			if (!guildID) continue
			const messageID = select("event_message", "message_id", {event_id: eventID}).pluck().get()
			if (messageID) {
				// 2: Linking to a known event
				result = MAKE_RESULT.MESSAGE_LINK[resultType](guildID, channelID, messageID)
			} else {
				// 3: Linking to an unknown event that OOYE didn't originally bridge - we can guess messageID from the timestamp
				let originalEvent
				try {
					originalEvent = await di.api.getEvent(roomID, eventID)
				} catch (e) {
					continue // Our homeserver doesn't know about the event, so can't resolve it to a Discord link
				}
				const guessedMessageID = dUtils.timestampToSnowflakeInexact(originalEvent.origin_server_ts)
				result = MAKE_RESULT.MESSAGE_LINK[resultType](guildID, channelID, guessedMessageID)
			}
		}

		input = input.slice(0, match.index + offset) + result + input.slice(match.index + match[0].length + offset)
		offset += result.length - match[0].length
	}

	return input
}

/**
 * @param {string} content
 * @param {string} senderMxid
 * @param {string} roomID
 * @param {DiscordTypes.APIGuild} guild
 * @param {{api: import("../../matrix/api"), snow: import("snowtransfer").SnowTransfer}} di
 */
async function checkWrittenMentions(content, senderMxid, roomID, guild, di) {
	let writtenMentionMatch = content.match(/(?:^|[^"[<>/A-Za-z0-9])@([A-Za-z][A-Za-z0-9._\[\]\(\)-]+):?/d) // /d flag for indices requires node.js 16+
	if (writtenMentionMatch) {
		if (writtenMentionMatch[1] === "room") { // convert @room to @everyone
			const powerLevels = await di.api.getStateEvent(roomID, "m.room.power_levels", "")
			const userPower = powerLevels.users?.[senderMxid] || 0
			if (userPower >= powerLevels.notifications?.room) {
				return {
					// @ts-ignore - typescript doesn't know about indices yet
					content: content.slice(0, writtenMentionMatch.indices[1][0]-1) + `@everyone` + content.slice(writtenMentionMatch.indices[1][1]),
					ensureJoined: [],
					allowedMentionsParse: ["everyone"]
				}
			}
		} else if (writtenMentionMatch[1].length < 40) { // the API supports up to 100 characters, but really if you're searching more than 40, something messed up
			const results = await di.snow.guild.searchGuildMembers(guild.id, {query: writtenMentionMatch[1]})
			if (results[0]) {
				assert(results[0].user)
				return {
					// @ts-ignore - typescript doesn't know about indices yet
					content: content.slice(0, writtenMentionMatch.indices[1][0]-1) + `<@${results[0].user.id}>` + content.slice(writtenMentionMatch.indices[1][1]),
					ensureJoined: [results[0].user],
					allowedMentionsParse: []
				}
			}
		}
	}
}

/**
 * @param {Element} node
 * @param {string[]} tagNames allcaps tag names
 * @returns {any | undefined} the node you were checking for, or undefined
 */
function nodeIsChildOf(node, tagNames) {
	// @ts-ignore
	for (; node; node = node.parentNode) if (tagNames.includes(node.tagName)) return node
}

const attachmentEmojis = new Map([
	["m.image", "🖼️"],
	["m.video", "🎞️"],
	["m.audio", "🎶"],
	["m.file", "📄"]
])

async function getL1L2ReplyLine(called = false) {
	// @ts-ignore
	const autoEmoji = new Map(select("auto_emoji", ["name", "emoji_id"], {}, "WHERE name = 'L1' OR name = 'L2'").raw().all())
	if (autoEmoji.size === 2) {
		return `<:L1:${autoEmoji.get("L1")}><:L2:${autoEmoji.get("L2")}>`
	}
	/* c8 ignore start */
	if (called) {
		// Don't know how this could happen, but just making sure we don't enter an infinite loop.
		console.warn("Warning: OOYE is missing data to format replies. To fix this: `npm run setup`")
		return ""
	}
	await setupEmojis.setupEmojis()
	return getL1L2ReplyLine(true)
	/* c8 ignore stop */
}

/**
 * @param {Ty.Event.Outer_M_Room_Message | Ty.Event.Outer_M_Room_Message_File | Ty.Event.Outer_M_Sticker | Ty.Event.Outer_M_Room_Message_Encrypted_File} event
 * @param {import("discord-api-types/v10").APIGuild} guild
 * @param {{api: import("../../matrix/api"), snow: import("snowtransfer").SnowTransfer, mxcDownloader: (mxc: string) => Promise<Buffer | undefined>}} di simple-as-nails dependency injection for the matrix API
 */
async function eventToMessage(event, guild, di) {
	let displayName = event.sender
	let avatarURL = undefined
	const allowedMentionsParse = ["users", "roles"]
	/** @type {string[]} */
	let messageIDsToEdit = []
	let replyLine = ""
	// Extract a basic display name from the sender
	const match = event.sender.match(/^@(.*?):/)
	if (match) displayName = match[1]
	// Try to extract an accurate display name and avatar URL from the member event
	const member = await getMemberFromCacheOrHomeserver(event.room_id, event.sender, di?.api)
	if (member.displayname) displayName = member.displayname
	if (member.avatar_url) avatarURL = mxUtils.getPublicUrlForMxc(member.avatar_url)
	// If the display name is too long to be put into the webhook (80 characters is the maximum),
	// put the excess characters into displayNameRunoff, later to be put at the top of the message
	let [displayNameShortened, displayNameRunoff] = splitDisplayName(displayName)
	// If the message type is m.emote, the full name is already included at the start of the message, so remove any runoff
	if (event.type === "m.room.message" && event.content.msgtype === "m.emote") {
		displayNameRunoff = ""
	}

	let content = event.content.body // ultimate fallback
	/** @type {{id: string, filename: string}[]} */
	const attachments = []
	/** @type {({name: string, mxc: string} | {name: string, mxc: string, key: string, iv: string} | {name: string, buffer: Buffer})[]} */
	const pendingFiles = []
	/** @type {DiscordTypes.APIUser[]} */
	const ensureJoined = []

	// Convert content depending on what the message is
	// Handle images first - might need to handle their `body`/`formatted_body` as well, which will fall through to the text processor
	let shouldProcessTextEvent = event.type === "m.room.message" && (event.content.msgtype === "m.text" || event.content.msgtype === "m.emote")
	if (event.type === "m.room.message" && (event.content.msgtype === "m.file" || event.content.msgtype === "m.video" || event.content.msgtype === "m.audio" || event.content.msgtype === "m.image")) {
		content = ""
		const filename = event.content.filename || event.content.body
		if ("file" in event.content) {
			// Encrypted
			assert.equal(event.content.file.key.alg, "A256CTR")
			attachments.push({id: "0", filename})
			pendingFiles.push({name: filename, mxc: event.content.file.url, key: event.content.file.key.k, iv: event.content.file.iv})
		} else {
			// Unencrypted
			attachments.push({id: "0", filename})
			pendingFiles.push({name: filename, mxc: event.content.url})
		}
		// Check if we also need to process a text event for this image - if it has a caption that's different from its filename
		if ((event.content.body && event.content.filename && event.content.body !== event.content.filename) || event.content.formatted_body) {
			shouldProcessTextEvent = true
		}
	}
	if (event.type === "m.sticker") {
		content = ""
		let filename = event.content.body
		if (event.type === "m.sticker") {
			let mimetype
			if (event.content.info?.mimetype?.includes("/")) {
				mimetype = event.content.info.mimetype
			} else {
				const res = await di.api.getMedia(event.content.url, {method: "HEAD"})
				if (res.status === 200) {
					mimetype = res.headers.get("content-type")
				}
				if (!mimetype) throw new Error(`Server error ${res.status} or missing content-type while detecting sticker mimetype`)
			}
			filename += "." + mimetype.split("/")[1]
		}
		attachments.push({id: "0", filename})
		pendingFiles.push({name: filename, mxc: event.content.url})
	} else if (shouldProcessTextEvent) {
		// Handling edits. If the edit was an edit of a reply, edits do not include the reply reference, so we need to fetch up to 2 more events.
		// this event ---is an edit of--> original event ---is a reply to--> past event
		await (async () => {
			// Check if there is an edit
			const relatesTo = event.content["m.relates_to"]
			if (!event.content["m.new_content"] || !relatesTo || relatesTo.rel_type !== "m.replace") return
			// Check if we have a pointer to what was edited
			const originalEventId = relatesTo.event_id
			if (!originalEventId) return
			messageIDsToEdit = select("event_message", "message_id", {event_id: originalEventId}, "ORDER BY part").pluck().all()
			if (!messageIDsToEdit.length) return

			// Ok, it's an edit.
			event = {...event, content: event.content["m.new_content"]}

			// Is it editing a reply? We need special handling if it is.
			// Get the original event, then check if it was a reply
			const originalEvent = await di.api.getEvent(event.room_id, originalEventId)
			const repliedToEventId = originalEvent?.content?.["m.relates_to"]?.["m.in_reply_to"]?.event_id
			if (!repliedToEventId) return

			// After all that, it's an edit of a reply.
			// We'll be sneaky and prepare the message data so that the next steps can handle it just like original messages.
			Object.assign(event.content, {
				"m.relates_to": {
					"m.in_reply_to": {
						event_id: repliedToEventId
					}
				}
			})
		})()

		// Handling replies. We'll look up the data of the replied-to event from the Matrix homeserver.
		// Note that an <mx-reply> element is not guaranteed because this might be m.new_content.
		await (async () => {
			const repliedToEventId = event.content["m.relates_to"]?.["m.in_reply_to"]?.event_id
			if (!repliedToEventId) return
			let repliedToEvent
			try {
				repliedToEvent = await di.api.getEvent(event.room_id, repliedToEventId)
			} catch (e) {
				// Original event isn't on our homeserver, so we'll *partially* trust the client's reply fallback.
				// We'll trust the fallback's quoted content and put it in the reply preview, but we won't trust the authorship info on it.

				// (But if the fallback's quoted content doesn't exist, we give up. There's nothing for us to quote.)
				if (event.content["format"] !== "org.matrix.custom.html" || typeof event.content["formatted_body"] !== "string") {
					const lines = event.content.body.split("\n")
					let stage = 0
					for (let i = 0; i < lines.length; i++) {
						if (stage >= 0 && lines[i][0] === ">") stage = 1
						if (stage >= 1 && lines[i].trim() === "") stage = 2
						if (stage === 2 && lines[i].trim() !== "") {
							event.content.body = lines.slice(i).join("\n")
							break
						}
					}
					return
				}
				const mxReply = event.content["formatted_body"]
				const quoted = mxReply.match(/^<mx-reply><blockquote>.*?In reply to.*?<br>(.*)<\/blockquote><\/mx-reply>/)?.[1]
				if (!quoted) return
				const contentPreviewChunks = chunk(
					entities.decodeHTML5Strict( // Remove entities like &amp; &quot;
						quoted.replace(/^\s*<blockquote>.*?<\/blockquote>(.....)/s, "$1") // If the message starts with a blockquote, don't count it and use the message body afterwards
							.replace(/(?:\n|<br>)+/g, " ") // Should all be on one line
							.replace(/<span [^>]*data-mx-spoiler\b[^>]*>.*?<\/span>/g, "[spoiler]") // Good enough method of removing spoiler content. (I don't want to break out the HTML parser unless I have to.)
							.replace(/<[^>]+>/g, "") // Completely strip all HTML tags and formatting.
					), 50)
				replyLine = "-# > " + contentPreviewChunks[0]
				if (contentPreviewChunks.length > 1) replyLine = replyLine.replace(/[,.']$/, "") + "..."
				replyLine += "\n"
				return
			}

			replyLine = await getL1L2ReplyLine()
			const row = from("event_message").join("message_channel", "message_id").select("channel_id", "message_id").where({event_id: repliedToEventId}).and("ORDER BY part").get()
			if (row) {
				replyLine += `https://discord.com/channels/${guild.id}/${row.channel_id}/${row.message_id} `
			}
			// If the event has been edited, the homeserver will include the relation in `unsigned`.
			if (repliedToEvent.unsigned?.["m.relations"]?.["m.replace"]?.content?.["m.new_content"]) {
				repliedToEvent = repliedToEvent.unsigned["m.relations"]["m.replace"] // Note: this changes which event_id is in repliedToEvent.
				repliedToEvent.content = repliedToEvent.content["m.new_content"]
			}
			/** @type {string} */
			let repliedToContent = repliedToEvent.content.formatted_body || repliedToEvent.content.body
			const fileReplyContentAlternative = attachmentEmojis.get(repliedToEvent.content.msgtype)
			let contentPreview
			if (fileReplyContentAlternative) {
				contentPreview = " " + fileReplyContentAlternative
			} else if (repliedToEvent.unsigned?.redacted_because) {
				contentPreview = " (in reply to a deleted message)"
			} else if (typeof repliedToContent !== "string") {
				// in reply to a weird metadata event like m.room.name, m.room.member...
				// I'm not implementing text fallbacks for arbitrary room events. this should cover most cases
				// this has never ever happened in the wild anyway
				repliedToEvent.sender = ""
				contentPreview = " (channel details edited)"
			} else {
				// Generate a reply preview for a standard message
				repliedToContent = repliedToContent.replace(/.*<\/mx-reply>/s, "") // Remove everything before replies, so just use the actual message body
				repliedToContent = repliedToContent.replace(/^\s*<blockquote>.*?<\/blockquote>(.....)/s, "$1") // If the message starts with a blockquote, don't count it and use the message body afterwards
				repliedToContent = repliedToContent.replace(/(?:\n|<br>)+/g, " ") // Should all be on one line
				repliedToContent = repliedToContent.replace(/<span [^>]*data-mx-spoiler\b[^>]*>.*?<\/span>/g, "[spoiler]") // Good enough method of removing spoiler content. (I don't want to break out the HTML parser unless I have to.)
				repliedToContent = repliedToContent.replace(/<img([^>]*)>/g, (_, att) => { // Convert Matrix emoji images into Discord emoji markdown
					const mxcUrlMatch = att.match(/\bsrc="(mxc:\/\/[^"]+)"/)
					const titleTextMatch = att.match(/\btitle=":?([^:"]+)/)
					return convertEmoji(mxcUrlMatch?.[1], titleTextMatch?.[1], false, false)
				})
				repliedToContent = repliedToContent.replace(/<[^:>][^>]*>/g, "") // Completely strip all HTML tags and formatting.
				repliedToContent = repliedToContent.replace(/\bhttps?:\/\/[^ )]*/g, "<$&>")
				repliedToContent = entities.decodeHTML5Strict(repliedToContent) // Remove entities like &amp; &quot;
				const contentPreviewChunks = chunk(repliedToContent, 50)
				if (contentPreviewChunks.length) {
					contentPreview = ": " + contentPreviewChunks[0]
					if (contentPreviewChunks.length > 1) contentPreview = contentPreview.replace(/[,.']$/, "") + "..."
				} else {
					contentPreview = ""
				}
			}
			const sender = repliedToEvent.sender
			const authorID = getUserOrProxyOwnerID(sender)
			if (authorID) {
				replyLine += `<@${authorID}>`
			} else {
				let senderName = select("member_cache", "displayname", {mxid: sender}).pluck().get()
				if (!senderName) senderName = sender.match(/@([^:]*)/)?.[1]
				if (senderName) replyLine += `**Ⓜ${senderName}**`
			}
			replyLine = `-# > ${replyLine}${contentPreview}\n`
		})()

		if (event.content.format === "org.matrix.custom.html" && event.content.formatted_body) {
			let input = event.content.formatted_body
			if (event.content.msgtype === "m.emote") {
				input = `* ${displayName} ${input}`
			}

			// Handling mentions of Discord users
			input = input.replace(/("https:\/\/matrix.to\/#\/((?:@|%40)[^"]+)")>/g, (whole, attributeValue, mxid) => {
				mxid = decodeURIComponent(mxid)
				if (mxUtils.eventSenderIsFromDiscord(mxid)) {
					// Handle mention of an OOYE sim user by their mxid
					const id = select("sim", "user_id", {mxid}).pluck().get()
					if (!id) return whole
					return `${attributeValue} data-user-id="${id}">`
				} else {
					// Handle mention of a Matrix user by their mxid
					// Check if this Matrix user is actually the sim user from another old bridge in the room?
					const match = mxid.match(/[^:]*discord[^:]*_([0-9]{6,}):/) // try to match @_discord_123456, @_discordpuppet_123456, etc.
					if (match) return `${attributeValue} data-user-id="${match[1]}">`
					// Nope, just a real Matrix user.
					return whole
				}
			})

			// Handling mentions of rooms and room-messages
			input = await handleRoomOrMessageLinks(input, di)

			// Stripping colons after mentions
			input = input.replace(/( data-user-id.*?<\/a>):?/g, "$1")
			input = input.replace(/("https:\/\/matrix.to.*?<\/a>):?/g, "$1")

			// Element adds a bunch of <br> before </blockquote> but doesn't render them. I can't figure out how this even works in the browser, so let's just delete those.
			input = input.replace(/(?:\n|<br ?\/?>\s*)*<\/blockquote>/g, "</blockquote>")

			// The matrix spec hasn't decided whether \n counts as a newline or not, but I'm going to count it, because if it's in the data it's there for a reason.
			// But I should not count it if it's between block elements.
			input = input.replace(/(<\/?([^ >]+)[^>]*>)?\n(<\/?([^ >]+)[^>]*>)?/g, (whole, beforeContext, beforeTag, afterContext, afterTag) => {
				// console.error(beforeContext, beforeTag, afterContext, afterTag)
				if (typeof beforeTag !== "string" && typeof afterTag !== "string") {
					return "<br>"
				}
				beforeContext = beforeContext || ""
				beforeTag = beforeTag || ""
				afterContext = afterContext || ""
				afterTag = afterTag || ""
				if (!mxUtils.BLOCK_ELEMENTS.includes(beforeTag.toUpperCase()) && !mxUtils.BLOCK_ELEMENTS.includes(afterTag.toUpperCase())) {
					return beforeContext + "<br>" + afterContext
				} else {
					return whole
				}
			})

			// Note: Element's renderers on Web and Android currently collapse whitespace, like the browser does. Turndown also collapses whitespace which is good for me.
			// If later I'm using a client that doesn't collapse whitespace and I want turndown to follow suit, uncomment the following line of code, and it Just Works:
			// input = input.replace(/ /g, "&nbsp;")
			// There is also a corresponding test to uncomment, named "event2message: whitespace is retained"

			// Handling written @mentions: we need to look for candidate Discord members to join to the room
			// This shouldn't apply to code blocks, links, or inside attributes. So editing the HTML tree instead of regular expressions is a sensible choice here.
			// We're using the domino parser because Turndown uses the same and can reuse this tree.
			const doc = domino.createDocument(
				// DOM parsers arrange elements in the <head> and <body>. Wrapping in a custom element ensures elements are reliably arranged in a single element.
				'<x-turndown id="turndown-root">' + input + '</x-turndown>'
			);
			const root = doc.getElementById("turndown-root");
			async function forEachNode(node) {
				for (; node; node = node.nextSibling) {
					// Check written mentions
					if (node.nodeType === 3 && node.nodeValue.includes("@") && !nodeIsChildOf(node, ["A", "CODE", "PRE"])) {
						const result = await checkWrittenMentions(node.nodeValue, event.sender, event.room_id, guild, di)
						if (result) {
							node.nodeValue = result.content
							ensureJoined.push(...result.ensureJoined)
							allowedMentionsParse.push(...result.allowedMentionsParse)
						}
					}
					// Check for incompatible backticks in code blocks
					let preNode
					if (node.nodeType === 3 && node.nodeValue.includes("```") && (preNode = nodeIsChildOf(node, ["PRE"]))) {
						if (preNode.firstChild?.nodeName === "CODE") {
							const ext = preNode.firstChild.className.match(/language-(\S+)/)?.[1] || "txt"
							const filename = `inline_code.${ext}`
							// Build the replacement <code> node
							const replacementCode = doc.createElement("code")
							replacementCode.textContent = `[${filename}]`
							// Build its containing <span> node
							const replacement = doc.createElement("span")
							replacement.appendChild(doc.createTextNode(" "))
							replacement.appendChild(replacementCode)
							replacement.appendChild(doc.createTextNode(" "))
							// Replace the code block with the <span>
							preNode.replaceWith(replacement)
							// Upload the code as an attachment
							const content = getCodeContent(preNode.firstChild)
							attachments.push({id: String(attachments.length), filename})
							pendingFiles.push({name: filename, buffer: Buffer.from(content, "utf8")})
						}
					}
					await forEachNode(node.firstChild)
				}
			}
			await forEachNode(root)

			// SPRITE SHEET EMOJIS FEATURE: Emojis at the end of the message that we don't know about will be reuploaded as a sprite sheet.
			// First we need to determine which emojis are at the end.
			endOfMessageEmojis = []
			let match
			let last = input.length
			while ((match = input.slice(0, last).match(/<img [^>]*>\s*$/))) {
				if (!match[0].includes("data-mx-emoticon")) break
				const mxcUrl = match[0].match(/\bsrc="(mxc:\/\/[^"]+)"/)
				if (mxcUrl) endOfMessageEmojis.unshift(mxcUrl[1])
				assert(typeof match.index === "number", "Your JavaScript implementation does not comply with TC39: https://tc39.es/ecma262/multipage/text-processing.html#sec-regexpbuiltinexec")
				last = match.index
			}

			// @ts-ignore bad type from turndown
			content = turndownService.turndown(root)

			// Put < > around any surviving matrix.to links to hide the URL previews
			content = content.replace(/\bhttps?:\/\/matrix\.to\/[^<>\n )]*/g, "<$&>")

			// It's designed for commonmark, we need to replace the space-space-newline with just newline
			content = content.replace(/  \n/g, "\n")

			// If there's a blockquote at the start of the message body and this message is a reply, they should be visually separated
			if (replyLine && content.startsWith("> ")) content = "\n" + content

			// SPRITE SHEET EMOJIS FEATURE:
			content = await uploadEndOfMessageSpriteSheet(content, attachments, pendingFiles, di?.mxcDownloader)
		} else {
			// Looks like we're using the plaintext body!
			content = event.content.body

			if (event.content.msgtype === "m.emote") {
				content = `* ${displayName} ${content}`
			}

			content = await handleRoomOrMessageLinks(content, di) // Replace matrix.to links with discord.com equivalents where possible
			content = content.replace(/\bhttps?:\/\/matrix\.to\/[^<>\n )]*/, "<$&>") // Put < > around any surviving matrix.to links to hide the URL previews

			const result = await checkWrittenMentions(content, event.sender, event.room_id, guild, di)
			if (result) {
				content = result.content
				ensureJoined.push(...result.ensureJoined)
				allowedMentionsParse.push(...result.allowedMentionsParse)
			}

			// Markdown needs to be escaped, though take care not to escape the middle of links
			// @ts-ignore bad type from turndown
			content = turndownService.escape(content)
		}
	}

	content = displayNameRunoff + replyLine + content

	// Split into 2000 character chunks
	const chunks = chunk(content, 2000)
	/** @type {(DiscordTypes.RESTPostAPIWebhookWithTokenJSONBody & {files?: {name: string, file: Buffer | stream.Readable}[]})[]} */
	const messages = chunks.map(content => ({
		content,
		allowed_mentions: {
			parse: allowedMentionsParse
		},
		username: displayNameShortened,
		avatar_url: avatarURL
	}))

	if (attachments.length) {
		// If content is empty (should be the case when uploading a file) then chunk-text will create 0 messages.
		// There needs to be a message to add attachments to.
		if (!messages.length) messages.push({
			content,
			username: displayNameShortened,
			avatar_url: avatarURL
		})
		messages[0].attachments = attachments
		// @ts-ignore these will be converted to real files when the message is about to be sent
		messages[0].pendingFiles = pendingFiles
	}

	const messagesToEdit = []
	const messagesToSend = []
	for (let i = 0; i < messages.length; i++) {
		const next = messageIDsToEdit[0]
		if (next) {
			messagesToEdit.push({id: next, message: messages[i]})
			messageIDsToEdit.shift()
		} else {
			messagesToSend.push(messages[i])
		}
	}

	// Ensure there is code coverage for adding, editing, and deleting
	if (messagesToSend.length) void 0
	if (messagesToEdit.length) void 0
	if (messageIDsToEdit.length) void 0

	return {
		messagesToEdit,
		messagesToSend,
		messagesToDelete: messageIDsToEdit,
		ensureJoined
	}
}

module.exports.eventToMessage = eventToMessage
