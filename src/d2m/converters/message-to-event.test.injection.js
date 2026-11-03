// @ts-check

const {test} = require("supertape")
const data = require("../../../test/data")
const domino = require("domino")
const {mockGetEffectivePower} = require("../../matrix/utils.test")
const {messageToEvent} = require("./message-to-event")
const {db, discord} = require("../../passthrough")

// Property tests: A canary is appended to potentially user-controlled fields in a discord event and should not come out as real HTML.

const CANARY = `"'><x-canary></x-canary>`

const DISCORD_GENERATED_FIELDS = new Set([
	"application_id",
	"avatar",
	"channel_id",
	"discriminator",
	"edited_timestamp",
	"guild_id",
	"id",
	"identity_guild_id",
	"message_id",
	"proxy_icon_url",
	"proxy_url",
	"reference_id",
	"target_message_id",
	"timestamp",
	"webhook_id",
	"url",
])

/**
 * Paths to every field in a discord event that a user could have written.
 * @returns {Generator<string[]>}
 */
function* userControlledFields(value, path = []) {
	for (const [k, v] of Object.entries(value)) {
		if (typeof v === "string") {
			if (!DISCORD_GENERATED_FIELDS.has(k)) yield [...path, k]
		} else if (v && typeof v === "object") {
			yield* userControlledFields(v, [...path, k])
		}
	}
}

const PROPERTY_TEST_DI = {
	api: {
		getEffectivePower: mockGetEffectivePower(),
		getJoinedMembers: async () => ({ joined: {} }),
		getEvent: async (roomID, eventID) => ({
			type: "m.room.message",
			sender: "@cadence:cadence.moe",
			content: { msgtype: "m.text", body: "hi" },
			event_id: eventID,
			room_id: roomID,
			origin_server_ts: 0,
			unsigned: {},
		}),
		getEventForTimestamp: async () => ({
			event_id: "$canary",
			origin_server_ts: 0,
		}),
	},
}

/**
 * Return a deep copy of `value` with a canary appended to the string at `path`.
 * @param {Object} value
 * @param {string[]} path
 */
function withCanary(value, path) {
	const copy = structuredClone(value)
	let parent = copy
	for (const k of path.slice(0, -1)) {
		parent = parent[k]
	}
	parent[path.slice(-1)[0]] += CANARY
	return copy
}

async function assertCanaryEscaped(t, message, guild) {
	// @ts-ignore - DI incompatible
	const events = await messageToEvent(message, guild, {}, PROPERTY_TEST_DI)
	const leaked = events.find(event => event.formatted_body && domino.createDocument(`<body>${event.formatted_body}</body>`).querySelector("x-canary"))
	t.notOk(leaked?.formatted_body, "canary was not escaped")
}

const MESSAGE_CATEGORIES = [
	"message",
	"pk_message",
	"message_mention_everyone",
	"message_with_embeds",
	"message_with_components",
	"special_message",
	"interaction_message",
]

for (const category of MESSAGE_CATEGORIES) {
	for (const [name, message] of Object.entries(data[category])) {
		// Skip tests that inject data that fails assertions on what Discord ought to send
		if (["special_message.emoji_added"].includes(`${category}.${name}`)) continue

		for (const path of userControlledFields(message)) {
			test(`message2event: ${category}.${name}.${path.join(".")} was escaped`, async t => {
				await assertCanaryEscaped(t, withCanary(message, path), data.guild.general)
			})
		}
	}
}

// Channel and role names need to be edited in the database/discord objects.
for (const category of MESSAGE_CATEGORIES) {
	for (const [name, message] of Object.entries(data[category])) {
		test(`message2event: channel/role names in ${category}.${name} were escaped`, async t => {
			// Copy and set role names
			const guild = structuredClone(data.guild.general)
			for (const role of guild.roles) {
				role.name += CANARY
			}

			// Set channel names
			db.prepare("UPDATE channel_room SET name = name || ?, nick = nick || ?").run(CANARY, CANARY)
			for (const channel of discord.channels.values()) {
				if (channel.name) {
					channel.name += CANARY
				}
			}

			// Do work
			try {
				await assertCanaryEscaped(t, message, guild)
			}

			// Undo setting channel names
			finally {
				db.prepare("UPDATE channel_room SET name = replace(name, ?, ''), nick = replace(nick, ?, '')").run(CANARY, CANARY)
				for (const channel of discord.channels.values()) {
					if (channel.name) {
						channel.name = channel.name.slice(0, -CANARY.length)
					}
				}
			}
		})
	}
}
