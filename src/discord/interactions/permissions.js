// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const Ty = require("../../types")
const {discord, sync, select, from} = require("../../passthrough")
const assert = require("assert/strict")
const {id: botID} = require("../../../addbot")
const {InteractionMethods} = require("snowtransfer")

/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")

/**
 * @param {DiscordTypes.APIContextMenuGuildInteraction} interaction
 * @param {{api: typeof api}} di
 * @returns {AsyncGenerator<{[k in keyof InteractionMethods]?: Parameters<InteractionMethods[k]>[2]}>}
 */
async function* _interact({data, guild_id}, {api}) {
	// Get message info
	const row = from("event_message")
		.join("message_channel", "message_id")
		.select("event_id", "source", "channel_id")
		.where({message_id: data.target_id})
		.get()

	// Can't operate on Discord users
	if (!row || row.source === 1) { // not bridged or sent by a discord user
		return yield {createInteractionResponse: {
			type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: `The permissions command can only be used on Matrix users.`,
				flags: DiscordTypes.MessageFlags.Ephemeral
			}
		}}
	}

	// Get the message sender, the person that will be inspected/edited
	const eventID = row.event_id
	const roomID = select("channel_room", "room_id", {channel_id: row.channel_id}).pluck().get()
	assert(roomID)
	const event = await api.getEvent(roomID, eventID)
	const sender = event.sender

	// Get the space, where the power levels will be inspected/edited
	const spaceID = select("guild_space", "space_id", {guild_id}).pluck().get()
	assert(spaceID)

	// Get the power level
	/** @type {Ty.Event.M_Power_Levels} */
	const powerLevelsContent = await api.getStateEvent(spaceID, "m.room.power_levels", "")
	const userPower = powerLevelsContent.users?.[event.sender] || 0

	// Administrators equal to the bot cannot be demoted
	if (userPower >= 100) {
		return yield {createInteractionResponse: {
			type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: `\`${sender}\` has administrator permissions. This cannot be edited.`,
				flags: DiscordTypes.MessageFlags.Ephemeral
			}
		}}
	}

	yield {createInteractionResponse: {
		type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
		data: {
			content: `Showing permissions for \`${sender}\`. Click to edit.`,
			flags: DiscordTypes.MessageFlags.Ephemeral,
			components: [
				{
					type: DiscordTypes.ComponentType.ActionRow,
					components: [
						{
							type: DiscordTypes.ComponentType.StringSelect,
							custom_id: "permissions_edit",
							options: [
								{
									label: "Default",
									value: "default",
									default: userPower < 50
								}, {
									label: "Moderator",
									value: "moderator",
									default: userPower >= 50 && userPower < 100
								}, {
									label: "Admin (you cannot undo this!)",
									value: "admin",
									default: userPower === 100
								}
							]
						}
					]
				}
			]
		}
	}}
}

/**
 * @param {DiscordTypes.APIMessageComponentSelectMenuInteraction} interaction
 * @param {{api: typeof api}} di
 * @returns {AsyncGenerator<{[k in keyof InteractionMethods]?: Parameters<InteractionMethods[k]>[2]}>}
 */
async function* _interactEdit({data, guild_id, message}, {api}) {
	// Get the person that will be inspected/edited
	const mxid = message.content.match(/`(@(?:[^:]+):(?:[a-z0-9:-]+\.[a-z0-9.:-]+))`/)?.[1]
	assert(mxid)

	const permission = data.values[0]
	const power =
		( permission === "admin" ? 100
		: permission === "moderator" ? 50
		: 0)

	yield {createInteractionResponse: {
		type: DiscordTypes.InteractionResponseType.UpdateMessage,
		data: {
			content: `Updating \`${mxid}\` to **${permission}**, please wait...`,
			components: []
		}
	}}

	// Get the space, where the power levels will be inspected/edited
	const spaceID = select("guild_space", "space_id", {guild_id}).pluck().get()
	assert(spaceID)

	// Do it
	await api.setUserPowerCascade(spaceID, mxid, power)

	// ACK
	yield {editOriginalInteractionResponse: {
		content: `Updated \`${mxid}\` to **${permission}**.`,
		components: []
	}}
}


/* c8 ignore start */

/** @param {DiscordTypes.APIContextMenuGuildInteraction} interaction */
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

/** @param {DiscordTypes.APIMessageComponentSelectMenuInteraction} interaction */
async function interactEdit(interaction) {
	for await (const response of _interactEdit(interaction, {api})) {
		if (response.createInteractionResponse) {
			// TODO: Test if it is reasonable to remove `await` from these calls. Or zip these calls with the next interaction iteration and use Promise.all.
			await discord.snow.interaction.createInteractionResponse(interaction.id, interaction.token, response.createInteractionResponse)
		} else if (response.editOriginalInteractionResponse) {
			await discord.snow.interaction.editOriginalInteractionResponse(botID, interaction.token, response.editOriginalInteractionResponse)
		}
	}
}

module.exports.interact = interact
module.exports.interactEdit = interactEdit
module.exports._interact = _interact
module.exports._interactEdit = _interactEdit
