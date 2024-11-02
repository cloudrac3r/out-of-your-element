// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const assert = require("assert/strict")
const {InteractionMethods} = require("snowtransfer")
const {id: botID} = require("../../../addbot")
const {discord, sync, db, select} = require("../../passthrough")

/** @type {import("../../d2m/actions/create-room")} */
const createRoom = sync.require("../../d2m/actions/create-room")
/** @type {import("../../d2m/actions/create-space")} */
const createSpace = sync.require("../../d2m/actions/create-space")
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("../../matrix/read-registration")} */
const {reg} = sync.require("../../matrix/read-registration")

/**
 * @param {DiscordTypes.APIChatInputApplicationCommandGuildInteraction & {channel: DiscordTypes.APIGuildTextChannel}} interaction
 * @param {{api: typeof api}} di
 * @returns {AsyncGenerator<{[k in keyof InteractionMethods]?: Parameters<InteractionMethods[k]>[2]}>}
 */
async function* _interact({data, channel, guild_id}, {api}) {
	// Check guild exists - it might not exist if the application was added with applications.commands scope and not bot scope
	const guild = discord.guilds.get(guild_id)
	if (!guild) return yield {createInteractionResponse: {
		type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
		data: {
			content: `I can't perform actions in this server because there is no bot presence in the server. You should try re-adding this bot to the server, making sure that it has bot scope (not just commands).\nIf you add the bot from ${reg.ooye.bridge_origin} this should work automatically.`,
			flags: DiscordTypes.MessageFlags.Ephemeral
		}
	}}

	// Get named MXID
	/** @type {DiscordTypes.APIApplicationCommandInteractionDataStringOption[] | undefined} */ // @ts-ignore
	const options = data.options
	const input = options?.[0]?.value || ""
	const mxid = input.match(/@([^:]+):([a-z0-9:-]+\.[a-z0-9.:-]+)/)?.[0]
	if (!mxid) return yield {createInteractionResponse: {
		type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
		data: {
			content: "You have to say the Matrix ID of the person you want to invite. Matrix IDs look like this: `@username:example.org`",
			flags: DiscordTypes.MessageFlags.Ephemeral
		}
	}}

	// Ensure guild and room are bridged
	db.prepare("INSERT OR IGNORE INTO guild_active (guild_id, autocreate) VALUES (?, 1)").run(guild_id)
	const existing = createRoom.existsOrAutocreatable(channel, guild_id)
	if (existing === 0) return yield {createInteractionResponse: {
		type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
		data: {
			content: "This channel isn't bridged, so you can't invite Matrix users yet. Try turning on automatic room-creation or link a Matrix room in the website.",
			flags: DiscordTypes.MessageFlags.Ephemeral
		}
	}}
	assert(existing) // can't be null or undefined as we just inserted the guild_active row

	yield {createInteractionResponse: {
		type: DiscordTypes.InteractionResponseType.DeferredChannelMessageWithSource,
		data: {
			flags: DiscordTypes.MessageFlags.Ephemeral
		}
	}}

	const spaceID = await createSpace.ensureSpace(guild)
	const roomID = await createRoom.ensureRoom(channel.id)

	// Check for existing invite to the space
	let spaceMember
	try {
		spaceMember = await api.getStateEvent(spaceID, "m.room.member", mxid)
	} catch (e) {}
	if (spaceMember && spaceMember.membership === "invite") {
		return yield {editOriginalInteractionResponse: {
			content: `\`${mxid}\` already has an invite, which they haven't accepted yet.`,
		}}
	}

	// Invite Matrix user if not in space
	if (!spaceMember || spaceMember.membership !== "join") {
		await api.inviteToRoom(spaceID, mxid)
		return yield {editOriginalInteractionResponse: {
			content: `You invited \`${mxid}\` to the server.`
		}}
	}

	// The Matrix user *is* in the space, maybe we want to invite them to this channel?
	let roomMember
	try {
		roomMember = await api.getStateEvent(roomID, "m.room.member", mxid)
	} catch (e) {}
	if (!roomMember || (roomMember.membership !== "join" && roomMember.membership !== "invite")) {
		return yield {editOriginalInteractionResponse: {
			content: `\`${mxid}\` is already in this server. Would you like to additionally invite them to this specific channel?`,
			components: [{
				type: DiscordTypes.ComponentType.ActionRow,
				components: [{
					type: DiscordTypes.ComponentType.Button,
					custom_id: "invite_channel",
					style: DiscordTypes.ButtonStyle.Primary,
					label: "Sure",
				}]
			}]
		}}
	}

	// The Matrix user *is* in the space and in the channel.
	return yield {editOriginalInteractionResponse: {
		content: `\`${mxid}\` is already in this server and this channel.`,
	}}
}

/**
 * @param {DiscordTypes.APIMessageComponentGuildInteraction} interaction
 * @param {{api: typeof api}} di
 * @returns {Promise<DiscordTypes.APIInteractionResponse>}
 */
async function _interactButton({channel, message}, {api}) {
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

/* c8 ignore start */

/** @param {DiscordTypes.APIChatInputApplicationCommandGuildInteraction & {channel: DiscordTypes.APIGuildTextChannel}} interaction */
async function interact(interaction) {
	for await (const response of _interact(interaction, {api})) {
		if (response.createInteractionResponse) {
			// TODO: Test if it is reasonable to remove `await` from these calls. Or zip these calls with the next interaction iteration and use Promise.all.
			await discord.snow.interaction.createInteractionResponse(interaction.id, interaction.token, response.createInteractionResponse)
		} else if (response.editOriginalInteractionResponse) {
			await discord.snow.interaction.editOriginalInteractionResponse(botID, interaction.token, response.editOriginalInteractionResponse)
		}
	}
}

/** @param {DiscordTypes.APIMessageComponentGuildInteraction} interaction */
async function interactButton(interaction) {
	await discord.snow.interaction.createInteractionResponse(interaction.id, interaction.token, await _interactButton(interaction, {api}))
}

module.exports.interact = interact
module.exports.interactButton = interactButton
module.exports._interact = _interact
module.exports._interactButton = _interactButton
