// @ts-check

const assert = require("assert")

const passthrough = require("../../passthrough")
const { sync, db } = passthrough

/**
 * Downcased and stripped username. Can only include a basic set of characters.
 * https://spec.matrix.org/v1.6/appendices/#user-identifiers
 * @param {import("discord-api-types/v10").APIUser} user
 * @returns {string} localpart
 */
function downcaseUsername(user) {
	// First, try to convert the username to the set of allowed characters
	let downcased = user.username.toLowerCase()
		// spaces to underscores...
		.replace(/ /g, "_")
		// remove disallowed characters...
		.replace(/[^a-z0-9._=/-]*/g, "")
		// remove leading and trailing dashes and underscores...
		.replace(/(?:^[_-]*|[_-]*$)/g, "")
	// The new length must be at least 2 characters (in other words, it should have some content)
	if (downcased.length < 2) {
		downcased = user.id
	}
	return downcased
}

/** @param {string[]} preferences */
function* generateLocalpartAlternatives(preferences) {
	const best = preferences[0]
	assert.ok(best)
	// First, suggest the preferences...
	for (const localpart of preferences) {
		yield localpart
	}
	// ...then fall back to generating number suffixes...
	let i = 2
	while (true) {
		yield best + (i++)
	}
}

/**
 * Whole process for checking the database and generating the right sim name.
 * @param {import("discord-api-types/v10").APIUser} user
 * @returns {string}
 */
function userToSimName(user) {
	assert.notEqual(user.discriminator, "0000", "cannot create user for a webhook")

	// 1. Is sim user already registered?
	const existing = db.prepare("SELECT sim_name FROM sim WHERE discord_id = ?").pluck().get(user.id)
	if (existing) return existing

	// 2. Register based on username (could be new or old format)
	const downcased = downcaseUsername(user)
	const preferences = [downcased]
	if (user.discriminator.length === 4) { // Old style tag? If user.username is unavailable, try the full tag next
		preferences.push(downcased + user.discriminator)
	}

	// Check for conflicts with already registered sims
	/** @type {string[]} */
	const matches = db.prepare("SELECT sim_name FROM sim WHERE sim_name LIKE ? ESCAPE '@'").pluck().all(downcased + "%")
	// Keep generating until we get a suggestion that doesn't conflict
	for (const suggestion of generateLocalpartAlternatives(preferences)) {
		if (!matches.includes(suggestion)) return suggestion
	}

	throw new Error(`Ran out of suggestions when generating sim name. downcased: "${downcased}"`)
}

module.exports.userToSimName = userToSimName
