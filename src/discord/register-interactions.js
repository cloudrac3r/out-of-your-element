// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const {discord, sync, db, select} = require("../passthrough")
const {id} = require("../../addbot")

const matrixInfo = sync.require("./interactions/matrix-info.js")
const invite = sync.require("./interactions/invite.js")
const permissions = sync.require("./interactions/permissions.js")
const reactions = sync.require("./interactions/reactions.js")
const privacy = sync.require("./interactions/privacy.js")
const poll = sync.require("./interactions/poll.js")
const pollResponses = sync.require("./interactions/poll-responses.js")
const ping = sync.require("./interactions/ping.js")

// User must have EVERY permission in default_member_permissions to be able to use the command

function registerInteractions() {
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
		name: "Responses",
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
		],
	}, {
		name: "ping",
		contexts: [DiscordTypes.InteractionContextType.Guild],
		type: DiscordTypes.ApplicationCommandType.ChatInput,
		description: "Ping a Matrix user.",
		options: [
			{
				type: DiscordTypes.ApplicationCommandOptionType.String,
				description: "Display name or ID of the Matrix user",
				name: "user",
				autocomplete: true,
				required: true
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
}

/** @param {DiscordTypes.APIInteraction} interaction */
async function dispatchInteraction(interaction) {
	const interactionId = interaction.data?.["custom_id"] || interaction.data?.["name"]
	try {
		if (interaction.type === DiscordTypes.InteractionType.MessageComponent || interaction.type === DiscordTypes.InteractionType.ModalSubmit) {
			// All we get is custom_id, don't know which context the button was clicked in.
			// So we namespace these ourselves in the custom_id. Currently the only existing namespace is POLL_.
			if (interaction.data.custom_id.startsWith("POLL_")) {
				await poll.interact(interaction)
			} else {
				throw new Error(`Unknown message component ${interaction.data.custom_id}`)
			}
		} else {
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
			} else if (interactionId === "Responses") {
				/** @type {DiscordTypes.APIMessageApplicationCommandGuildInteraction} */ // @ts-ignore
				const messageInteraction = interaction
				if (messageInteraction.data.resolved.messages[messageInteraction.data.target_id]?.poll) {
					await pollResponses.interact(messageInteraction)
				} else {
					await reactions.interact(messageInteraction)
				}
			} else if (interactionId === "ping") {
				await ping.interact(interaction)
			} else if (interactionId === "privacy") {
				await privacy.interact(interaction)
			} else {
				throw new Error(`Unknown interaction ${interactionId}`)
			}
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
		try {
			await discord.snow.interaction.createFollowupMessage(id, interaction.token, {
				content: `Interaction failed: **${interactionId}**`
					+ `\nError trace:\n\`\`\`\n${stackLines.join("\n")}\`\`\``
					+ `Interaction data:\n\`\`\`\n${JSON.stringify(interaction.data, null, 2)}\`\`\``,
					flags: DiscordTypes.MessageFlags.Ephemeral
			})
		} catch (_) {
			throw e
		}
	}
}

module.exports.dispatchInteraction = dispatchInteraction
module.exports.registerInteractions = registerInteractions
