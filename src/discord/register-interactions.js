// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const {discord, sync, db, select} = require("../passthrough")
const {id} = require("../../addbot")

const matrixInfo = sync.require("./interactions/matrix-info.js")
const invite = sync.require("./interactions/invite.js")
const permissions = sync.require("./interactions/permissions.js")
const reactions = sync.require("./interactions/reactions.js")
const privacy = sync.require("./interactions/privacy.js")

// User must have EVERY permission in default_member_permissions to be able to use the command

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
	name: "privacy",
	contexts: [DiscordTypes.InteractionContextType.Guild],
	type: DiscordTypes.ApplicationCommandType.ChatInput,
	description: "Change whether Matrix users can join through direct invites, links, or the public directory.",
	default_member_permissions: String(DiscordTypes.PermissionFlagsBits.ManageGuild),
	options: [
		{
			type: DiscordTypes.ApplicationCommandOptionType.String,
			description: "Check or set the new privacy level",
			name: "level",
			choices: [{
				name: "❓️ Check the current privacy level and get more information.",
				value: "info"
			}, {
				name: "🤝 Only allow joining with a direct in-app invite from another user. No shareable invite links.",
				value: "invite"
			}, {
				name: "🔗 Matrix links can be created and shared like Discord's invite links. In-app invites still work.",
				value: "link",
			}, {
				name: "🌏️ Publicly visible in the Matrix directory, like Server Discovery. Invites and links still work.",
				value: "directory"
			}]
		}
	]
}]).catch(e => {
	console.error(e)
})

async function dispatchInteraction(interaction) {
	const interactionId = interaction.data.custom_id || interaction.data.name
	try {
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
		} else if (interactionId === "Reactions") {
			await reactions.interact(interaction)
		} else if (interactionId === "privacy") {
			await privacy.interact(interaction)
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
