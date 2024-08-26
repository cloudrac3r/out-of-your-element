// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const Ty = require("../../types")
const {discord, sync, db, select, from, as} = require("../../passthrough")
const assert = require("assert/strict")

/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")

/** @type {Map<string, Promise<{name: string, value: string}[]>>} spaceID -> list of rooms */
const cache = new Map()
/** @type {Map<string, string>} roomID -> spaceID */
const reverseCache = new Map()

// Manage clearing the cache
sync.addTemporaryListener(as, "type:m.room.name", /** @param {Ty.Event.StateOuter<Ty.Event.M_Room_Name>} event */ async event => {
	if (event.state_key !== "") return
	const roomID = event.room_id
	const spaceID = reverseCache.get(roomID)
	if (!spaceID) return
	const childRooms = await cache.get(spaceID)
	if (!childRooms) return
	if (event.content.name) {
		const found = childRooms.find(r => r.value === roomID)
		if (!found) return
		found.name = event.content.name
	} else {
		cache.set(spaceID, Promise.resolve(childRooms.filter(r => r.value !== roomID)))
		reverseCache.delete(roomID)
	}
})

// Manage adding to the cache
async function getHierarchy(spaceID) {
	return cache.get(spaceID) || (() => {
		const entry = (async () => {
			/** @type {{name: string, value: string}[]} */
			let childRooms = []
			/** @type {string | undefined} */
			let nextBatch = undefined
			do {
				/** @type {Ty.HierarchyPagination<Ty.R.Hierarchy>} */
				const res = await api.getHierarchy(spaceID, {from: nextBatch})
				for (const room of res.rooms) {
					if (room.name) {
						childRooms.push({name: room.name, value: room.room_id})
						reverseCache.set(room.room_id, spaceID)
					}
				}
				nextBatch = res.next_batch
			} while (nextBatch)
			return childRooms
		})()
		cache.set(spaceID, entry)
		return entry
	})()
}

/** @param {DiscordTypes.APIApplicationCommandAutocompleteGuildInteraction} interaction */
async function interactAutocomplete({id, token, data, guild_id}) {
	const spaceID = select("guild_space", "space_id", {guild_id}).pluck().get()
	if (!spaceID) {
		return discord.snow.interaction.createInteractionResponse(id, token, {
			type: DiscordTypes.InteractionResponseType.ApplicationCommandAutocompleteResult,
			data: {
				choices: [
					{
						name: `Error: This server needs to be bridged somewhere first...`,
						value: "baby"
					}
				]
			}
		})
	}

	let rooms = await getHierarchy(spaceID)
	// @ts-ignore
	rooms = rooms.filter(r => r.name.startsWith(data.options[0].value))

	await discord.snow.interaction.createInteractionResponse(id, token, {
		type: DiscordTypes.InteractionResponseType.ApplicationCommandAutocompleteResult,
		data: {
			choices: rooms
		}
	})
}

/** @param {DiscordTypes.APIChatInputApplicationCommandGuildInteraction} interaction */
async function interactSubmit({id, token, data, guild_id}) {
	const spaceID = select("guild_space", "space_id", {guild_id}).pluck().get()
	if (!spaceID) {
		return discord.snow.interaction.createInteractionResponse(id, token, {
			type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
			data: {
				content: "Error: This server needs to be bridged somewhere first...",
				flags: DiscordTypes.MessageFlags.Ephemeral
			}
		})
	}

	return discord.snow.interaction.createInteractionResponse(id, token, {
		type: DiscordTypes.InteractionResponseType.ChannelMessageWithSource,
		data: {
			content: "Valid input. This would do something but it isn't implemented yet.",
			flags: DiscordTypes.MessageFlags.Ephemeral
		}
	})
}

/** @param {DiscordTypes.APIGuildInteraction} interaction */
async function interact(interaction) {
	if (interaction.type === DiscordTypes.InteractionType.ApplicationCommandAutocomplete) {
		return interactAutocomplete(interaction)
	} else if (interaction.type === DiscordTypes.InteractionType.ApplicationCommand) {
		// @ts-ignore
		return interactSubmit(interaction)
	}
}

module.exports.interact = interact
