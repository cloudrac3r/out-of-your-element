// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const {discord, sync, db, select} = require("../passthrough")
const {id} = require("../../addbot")

const matrixInfo = sync.require("./interactions/matrix-info.js")
const invite = sync.require("./interactions/invite.js")
const permissions = sync.require("./interactions/permissions.js")
const bridge = sync.require("./interactions/bridge.js")
const reactions = sync.require("./interactions/reactions.js")

discord.snow.interaction.bulkOverwriteApplicationCommands(id, [{
	name: "Matrix info",
	contexts: [DiscordTypes.InteractionContextType.Guild],
	type: DiscordTypes.ApplicationCommandType.Message,
}, {
	name: "Permissions",
	contexts: [DiscordTypes.InteractionContextType.Guild],
	type: DiscordTypes.ApplicationCommandType.Message,
	default_member_permissions: String(DiscordTypes.PermissionFlagsBits.KickMembers | DiscordTypes.PermissionFlagsBits.ManageRoles)
}, {
	name: "Reactions",
	contexts: [DiscordTypes.InteractionContextType.Guild],
	type: DiscordTypes.ApplicationCommandType.Message
}, {
	name: "invite",
	contexts: [DiscordTypes.InteractionContextType.Guild],
	type: DiscordTypes.ApplicationCommandType.ChatInput,
	description: "Invite a Matrix user to this Discord server",
	default_member_permissions: String(DiscordTypes.PermissionFlagsBits.CreateInstantInvite),
	options: [
		{
			type: DiscordTypes.ApplicationCommandOptionType.String,
			description: "The Matrix user to invite, e.g. @username:example.org",
			name: "user"
		}
	]
}, {
	name: "bridge",
	contexts: [DiscordTypes.InteractionContextType.Guild],
	type: DiscordTypes.ApplicationCommandType.ChatInput,
	description: "Start bridging this channel to a Matrix room.",
	default_member_permissions: String(DiscordTypes.PermissionFlagsBits.ManageChannels),
	options: [
		{
			type: DiscordTypes.ApplicationCommandOptionType.String,
			description: "Destination room to bridge to.",
			name: "room",
			autocomplete: true
		}
	]
}])

async function dispatchInteraction(interaction) {
	const interactionId = interaction.data.custom_id || interaction.data.name
	try {
		console.log(interaction)
		if (interactionId === "Matrix info") {
			await matrixInfo.interact(interaction)
		} else if (interactionId === "invite") {
			await invite.interact(interaction)
		} else if (interactionId === "invite_channel") {
			await invite.interactButton(interaction)
		} else if (interactionId === "Permissions") {
			await permissions.interact(interaction)
		} else if (interactionId === "permissions_edit") {
			await permissions.interactEdit(interaction)
		} else if (interactionId === "bridge") {
			await bridge.interact(interaction)
		} else if (interactionId === "Reactions") {
			await reactions.interact(interaction)
		} else {
			throw new Error(`Unknown interaction ${interactionId}`)
		}
	} catch (e) {
		let stackLines = null
		if (e.stack) {
			stackLines = e.stack.split("\n")
			let cloudstormLine = stackLines.findIndex(l => l.includes("/node_modules/cloudstorm/"))
			if (cloudstormLine !== -1) {
				stackLines = stackLines.slice(0, cloudstormLine - 2)
			}
		}
		await discord.snow.interaction.createFollowupMessage(id, interaction.token, {
			content: `Interaction failed: **${interactionId}**`
				+ `\nError trace:\n\`\`\`\n${stackLines.join("\n")}\`\`\``
				+ `Interaction data:\n\`\`\`\n${JSON.stringify(interaction.data, null, 2)}\`\`\``,
				flags: DiscordTypes.MessageFlags.Ephemeral
		})
	}
}

module.exports.dispatchInteraction = dispatchInteraction
