// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const {discord, sync, db, select} = require("../../passthrough")
const {id: botID} = require("../../../addbot")

/** @type {import("../../d2m/actions/create-space")} */
const createSpace = sync.require("../../d2m/actions/create-space")

/**
 * @param {DiscordTypes.APIChatInputApplicationCommandGuildInteraction} interaction
 */
async function interact({id, token, data, guild_id}) {
	// Check guild is bridged
	const current = select("guild_space", "privacy_level", {guild_id}).pluck().get()
	if (current == null) return {
		type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
		data: {
			content: "This server isn't bridged to Matrix, so you can't set the Matrix privacy level.",
			flags: DiscordTypes.MessageFlags.Ephemeral
		}
	}

	// Get input level
	/** @type {DiscordTypes.APIApplicationCommandInteractionDataStringOption[] | undefined} */ // @ts-ignore
	const options = data.options
	const input = options?.[0].value || ""
	const levels = ["invite", "link", "directory"]
	const level = levels.findIndex(x => input === x)
	if (level === -1) {
		return discord.snow.interaction.createInteractionResponse(id, token, {
			type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: "**Usage: `/privacy <level>`**. This will set who can join the space on Matrix-side. There are three levels:"
					+ "\n`invite`: Can only join with a direct in-app invite from another user. No shareable invite links."
					+ "\n`link`: Matrix links can be created and shared like Discord's invite links. In-app invites still work."
					+ "\n`directory`: Publicly visible in the Matrix space directory, like Server Discovery. Invites and links still work."
					+ `\n**Current privacy level: \`${levels[current]}\`**`,
				flags: DiscordTypes.MessageFlags.Ephemeral
			}
		})
	}

	await discord.snow.interaction.createInteractionResponse(id, token, {
		type: DiscordTypes.InteractionResponseType.DeferredChannelMessageWithSource,
		data: {
			flags: DiscordTypes.MessageFlags.Ephemeral
		}
	})

	db.prepare("UPDATE guild_space SET privacy_level = ? WHERE guild_id = ?").run(level, guild_id)
	await createSpace.syncSpaceFully(guild_id) // this is inefficient but OK to call infrequently on user request

	await discord.snow.interaction.editOriginalInteractionResponse(botID, token, {
		content: `Privacy level updated to \`${levels[level]}\`.`
	})
}

module.exports.interact = interact
