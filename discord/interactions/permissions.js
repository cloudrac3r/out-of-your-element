// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const Ty = require("../../types")
const {discord, sync, db, select, from} = require("../../passthrough")
const assert = require("assert/strict")

/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")

/** @param {DiscordTypes.APIContextMenuGuildInteraction} interaction */
async function interact({data, channel, id, token, guild_id}) {
	const row = select("event_message", ["event_id", "source"], {message_id: data.target_id}).get()
	assert(row)

	// Can't operate on Discord users
	if (row.source === 1) { // discord
		return discord.snow.interaction.createInteractionResponse(id, token, {
			type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: `This command is only meaningful for Matrix users.`,
				flags: DiscordTypes.MessageFlags.Ephemeral
			}
		})
	}

	// Get the message sender, the person that will be inspected/edited
	const eventID = row.event_id
	const roomID = select("channel_room", "room_id", {channel_id: channel.id}).pluck().get()
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
		return discord.snow.interaction.createInteractionResponse(id, token, {
			type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: `\`${sender}\` has administrator permissions. This cannot be edited.`,
				flags: DiscordTypes.MessageFlags.Ephemeral
			}
		})
	}

	await discord.snow.interaction.createInteractionResponse(id, token, {
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
								}
							]
						}
					]
				}
			]
		}
	})
}

/** @param {DiscordTypes.APIMessageComponentSelectMenuInteraction} interaction */
async function interactEdit({data, channel, id, token, guild_id, message}) {
	// Get the person that will be inspected/edited
	const mxid = message.content.match(/`(@(?:[^:]+):(?:[a-z0-9:-]+\.[a-z0-9.:-]+))`/)?.[1]
	assert(mxid)

	// Get the space, where the power levels will be inspected/edited
	const spaceID = select("guild_space", "space_id", {guild_id}).pluck().get()
	assert(spaceID)

	// Do it
	const permission = data.values[0]
	const power = permission === "moderator" ? 50 : 0
	await api.setUserPower(spaceID, mxid, power)
	// TODO: Cascade permissions through room hierarchy (make a helper for this already, geez...)

	// ACK
	await discord.snow.interaction.createInteractionResponse(id, token, {
		type: DiscordTypes.InteractionResponseType.DeferredMessageUpdate
	})
}

module.exports.interact = interact
module.exports.interactEdit = interactEdit
