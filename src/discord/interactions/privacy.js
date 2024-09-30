// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const {discord, sync, db, select} = require("../../passthrough")
const {id: botID} = require("../../../addbot")
const {InteractionMethods} = require("snowtransfer")

/** @type {import("../../d2m/actions/create-space")} */
const createSpace = sync.require("../../d2m/actions/create-space")

/**
 * @param {DiscordTypes.APIChatInputApplicationCommandGuildInteraction} interaction
 * @param {{createSpace: typeof createSpace}} di
 * @returns {AsyncGenerator<{[k in keyof InteractionMethods]?: Parameters<InteractionMethods[k]>[2]}>}
 */
async function* _interact({data, guild_id}, {createSpace}) {
	// Check guild is bridged
	const current = select("guild_space", "privacy_level", {guild_id}).pluck().get()
	if (current == null) {
		return yield {createInteractionResponse: {
			type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: "This server isn't bridged to Matrix, so you can't set the Matrix privacy level.",
				flags: DiscordTypes.MessageFlags.Ephemeral
			}
		}}
	}

	// Get input level
	/** @type {DiscordTypes.APIApplicationCommandInteractionDataStringOption[] | undefined} */ // @ts-ignore
	const options = data.options
	const input = options?.[0]?.value || ""
	const levels = ["invite", "link", "directory"]
	const level = levels.findIndex(x => input === x)
	if (level === -1) {
		return yield {createInteractionResponse: {
			type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: "**Usage: `/privacy <level>`**. This will set who can join the space on Matrix-side. There are three levels:"
					+ "\n`invite`: Can only join with a direct in-app invite from another user. No shareable invite links."
					+ "\n`link`: Matrix links can be created and shared like Discord's invite links. In-app invites still work."
					+ "\n`directory`: Publicly visible in the Matrix space directory, like Server Discovery. Invites and links still work."
					+ `\n**Current privacy level: \`${levels[current]}\`**`,
				flags: DiscordTypes.MessageFlags.Ephemeral
			}
		}}
	}

	yield {createInteractionResponse: {
		type: DiscordTypes.InteractionResponseType.DeferredChannelMessageWithSource,
		data: {
			flags: DiscordTypes.MessageFlags.Ephemeral
		}
	}}

	db.prepare("UPDATE guild_space SET privacy_level = ? WHERE guild_id = ?").run(level, guild_id)
	await createSpace.syncSpaceFully(guild_id) // this is inefficient but OK to call infrequently on user request

	yield {editOriginalInteractionResponse: {
		content: `Privacy level updated to \`${levels[level]}\`.`
	}}
}

/* c8 ignore start */

/** @param {DiscordTypes.APIChatInputApplicationCommandGuildInteraction} interaction */
async function interact(interaction) {
	for await (const response of _interact(interaction, {createSpace})) {
		if (response.createInteractionResponse) {
			// TODO: Test if it is reasonable to remove `await` from these calls. Or zip these calls with the next interaction iteration and use Promise.all.
			await discord.snow.interaction.createInteractionResponse(interaction.id, interaction.token, response.createInteractionResponse)
		} else if (response.editOriginalInteractionResponse) {
			await discord.snow.interaction.editOriginalInteractionResponse(botID, interaction.token, response.editOriginalInteractionResponse)
		}
	}
}

module.exports.interact = interact
module.exports._interact = _interact
