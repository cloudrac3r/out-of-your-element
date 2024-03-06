// @ts-check

const Ty = require("../../types")
const DiscordTypes = require("discord-api-types/v10")

const passthrough = require("../../passthrough")
const {discord, sync, select} = passthrough
/** @type {import("../../m2d/converters/utils")} */
const utils = sync.require("../../m2d/converters/utils")

/**
 * @typedef ReactionRemoveRequest
 * @prop {string} eventID
 * @prop {string | null} mxid
 * @prop {bigint} [hash]
 */

/**
 * @param {DiscordTypes.GatewayMessageReactionRemoveDispatchData} data
 * @param {Ty.Event.Outer<Ty.Event.M_Reaction>[]} reactions
 * @param {string} key
 */
function removeReaction(data, reactions, key) {
	/** @type {ReactionRemoveRequest[]} */
	const removals = []

	const wantToRemoveMatrixReaction = data.user_id === discord.application.id
	for (const event of reactions) {
		const eventID = event.event_id
		if (event.content["m.relates_to"].key === key) {
			const lookingAtMatrixReaction = !utils.eventSenderIsFromDiscord(event.sender)
			if (lookingAtMatrixReaction && wantToRemoveMatrixReaction) {
				// We are removing a Matrix user's reaction, so we need to redact from the correct user ID (not @_ooye_matrix_bridge).
				// Even though the bridge bot only reacted once on Discord-side, multiple Matrix users may have
				// reacted on Matrix-side. Semantically, we want to remove the reaction from EVERY Matrix user.
				// Also need to clean up the database.
				const hash = utils.getEventIDHash(event.event_id)
				removals.push({eventID, mxid: null, hash})
			}
			if (!lookingAtMatrixReaction && !wantToRemoveMatrixReaction) {
				// We are removing a Discord user's reaction, so we just make the sim user remove it.
				const mxid = select("sim", "mxid", {user_id: data.user_id}).pluck().get()
				if (mxid === event.sender) {
					removals.push({eventID, mxid})
				}
			}
		}
	}

	return removals
}

/**
 * @param {DiscordTypes.GatewayMessageReactionRemoveEmojiDispatchData} data
 * @param {Ty.Event.Outer<Ty.Event.M_Reaction>[]} relations
 * @param {string} key
 */
function removeEmojiReaction(data, relations, key) {
	/** @type {ReactionRemoveRequest[]} */
	const removals = []

	for (const event of relations) {
		const eventID = event.event_id
		if (event.content["m.relates_to"].key === key) {
			const mxid = utils.eventSenderIsFromDiscord(event.sender) ? event.sender : null
			removals.push({eventID, mxid})
		}
	}

	return removals
}

/**
 * @param {DiscordTypes.GatewayMessageReactionRemoveAllDispatchData} data
 * @param {Ty.Event.Outer<Ty.Event.M_Reaction>[]} relations
 * @returns {ReactionRemoveRequest[]}
 */
function removeAllReactions(data, relations) {
	return relations.map(event => {
		const eventID = event.event_id
		const mxid = utils.eventSenderIsFromDiscord(event.sender) ? event.sender : null
		return {eventID, mxid}
	})
}

module.exports.removeReaction = removeReaction
module.exports.removeEmojiReaction = removeEmojiReaction
module.exports.removeAllReactions = removeAllReactions
