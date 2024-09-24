// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const Ty = require("../../types")
const assert = require("assert/strict")
const {discord, sync, db, select, from} = require("../../passthrough")

/** @type {import("../../d2m/actions/create-room")} */
const createRoom = sync.require("../../d2m/actions/create-room")
/** @type {import("../../d2m/actions/create-space")} */
const createSpace = sync.require("../../d2m/actions/create-space")
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")

/**
 * @param {DiscordTypes.APIChatInputApplicationCommandGuildInteraction & {channel: DiscordTypes.APIGuildTextChannel}} interaction
 * @returns {Promise<DiscordTypes.APIInteractionResponse>}
 */
async function _interact({data, channel, guild_id}) {
	// Get named MXID
	/** @type {DiscordTypes.APIApplicationCommandInteractionDataStringOption[] | undefined} */ // @ts-ignore
	const options = data.options
	const input = options?.[0].value || ""
	const mxid = input.match(/@([^:]+):([a-z0-9:-]+\.[a-z0-9.:-]+)/)?.[0]
	if (!mxid) return {
		type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
		data: {
			content: "You have to say the Matrix ID of the person you want to invite. Matrix IDs look like this: `@username:example.org`",
			flags: DiscordTypes.MessageFlags.Ephemeral
		}
	}

	const guild = discord.guilds.get(guild_id)
	assert(guild)

	// Ensure guild and room are bridged
	db.prepare("INSERT OR IGNORE INTO guild_active (guild_id, autocreate) VALUES (?, 1)").run(guild_id)
	const existing = createRoom.existsOrAutocreatable(channel, guild_id)
	if (existing === 0) return {
		type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
		data: {
			content: "This channel isn't bridged, so you can't invite Matrix users yet. Try turning on automatic room-creation or link a Matrix room in the website.",
			flags: DiscordTypes.MessageFlags.Ephemeral
		}
	}
	assert(existing) // can't be null or undefined as we just inserted the guild_active row

	const spaceID = await createSpace.ensureSpace(guild)
	const roomID = await createRoom.ensureRoom(channel.id)

	// Check for existing invite to the space
	let spaceMember
	try {
		spaceMember = await api.getStateEvent(spaceID, "m.room.member", mxid)
	} catch (e) {}
	if (spaceMember && spaceMember.membership === "invite") {
		return {
			type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: `\`${mxid}\` already has an invite, which they haven't accepted yet.`,
				flags: DiscordTypes.MessageFlags.Ephemeral
			}
		}
	}

	// Invite Matrix user if not in space
	if (!spaceMember || spaceMember.membership !== "join") {
		await api.inviteToRoom(spaceID, mxid)
		return {
			type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: `You invited \`${mxid}\` to the server.`
			}
		}
	}

	// The Matrix user *is* in the space, maybe we want to invite them to this channel?
	let roomMember
	try {
		roomMember = await api.getStateEvent(roomID, "m.room.member", mxid)
	} catch (e) {}
	if (!roomMember || (roomMember.membership !== "join" && roomMember.membership !== "invite")) {
		return {
			type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: `\`${mxid}\` is already in this server. Would you like to additionally invite them to this specific channel?`,
				flags: DiscordTypes.MessageFlags.Ephemeral,
				components: [{
					type: DiscordTypes.ComponentType.ActionRow,
					components: [{
						type: DiscordTypes.ComponentType.Button,
						custom_id: "invite_channel",
						style: DiscordTypes.ButtonStyle.Primary,
						label: "Sure",
					}]
				}]
			}
		}
	}

	// The Matrix user *is* in the space and in the channel.
	return {
		type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
		data: {
			content: `\`${mxid}\` is already in this server and this channel.`,
			flags: DiscordTypes.MessageFlags.Ephemeral
		}
	}
}

/**
 * @param {DiscordTypes.APIMessageComponentGuildInteraction} interaction
 * @returns {Promise<DiscordTypes.APIInteractionResponse>}
 */
async function _interactButton({channel, message}) {
	const mxid = message.content.match(/`(@(?:[^:]+):(?:[a-z0-9:-]+\.[a-z0-9.:-]+))`/)?.[1]
	assert(mxid)
	const roomID = select("channel_room", "room_id", {channel_id: channel.id}).pluck().get()
	await api.inviteToRoom(roomID, mxid)
	return {
		type: DiscordTypes.InteractionResponseType.UpdateMessage,
		data: {
			content: `You invited \`${mxid}\` to the channel.`,
			flags: DiscordTypes.MessageFlags.Ephemeral,
			components: []
		}
	}
}

/** @param {DiscordTypes.APIChatInputApplicationCommandGuildInteraction & {channel: DiscordTypes.APIGuildTextChannel}} interaction */
async function interact(interaction) {
	await discord.snow.interaction.createInteractionResponse(interaction.id, interaction.token, await _interact(interaction))
}

/** @param {DiscordTypes.APIMessageComponentGuildInteraction} interaction */
async function interactButton(interaction) {
	await discord.snow.interaction.createInteractionResponse(interaction.id, interaction.token, await _interactButton(interaction))
}

module.exports.interact = interact
module.exports.interactButton = interactButton
module.exports._interact = _interact
module.exports._interactButton = _interactButton
