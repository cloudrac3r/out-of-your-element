// @ts-check

const assert = require("assert")
const {reg} = require("../../matrix/read-registration")

const passthrough = require("../../passthrough")
const {select} = passthrough

const SPECIAL_USER_MAPPINGS = new Map([
	["1081004946872352958", ["clyde_ai", "clyde"]]
])

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
	// If requested, also make the Discord user ID part of the username
	if (reg.ooye.include_user_id_in_mxid) {
		downcased = user.id + "_" + downcased
	}
	// The new length must be at least 2 characters (in other words, it should have some content)
	if (downcased.length < 2) {
		downcased = user.id
	}
	return downcased
}

/** @param {string[]} preferences */
function* generateLocalpartAlternatives(preferences) {
	const best = preferences[0]
	assert(best)
	// First, suggest the preferences...
	for (const localpart of preferences) {
		yield localpart
	}
	// ...then fall back to generating number suffixes...
	let i = 2
	while (true) {
		yield best + (i++)
		/* c8 ignore next */
	}
}

/**
 * Whole process for checking the database and generating the right sim name.
 * It is very important this is not an async function: once the name has been chosen, the calling function should be able to immediately claim that name into the database in the same event loop tick.
 * @param {import("discord-api-types/v10").APIUser} user
 * @returns {string}
 */
function userToSimName(user) {
	if (!SPECIAL_USER_MAPPINGS.has(user.id)) { // skip this check for known special users
		assert.notEqual(user.discriminator, "0000", `cannot create user for a webhook: ${JSON.stringify(user)}`)
	}

	// 1. Is sim user already registered?
	const existing = select("sim", "user_id", {user_id: user.id}).pluck().get()
	assert.equal(existing, null, "Shouldn't try to create a new name for an existing sim")

	// 2. Register based on username (could be new or old format)
	// (Unless it's a special user, in which case copy their provided mappings.)
	const downcased = downcaseUsername(user)
	const preferences = SPECIAL_USER_MAPPINGS.get(user.id) || [downcased]
	if (user.discriminator.length === 4) { // Old style tag? If user.username is unavailable, try the full tag next
		preferences.push(downcased + user.discriminator)
	}

	// Check for conflicts with already registered sims
	const matches = select("sim", "sim_name", {}, "WHERE sim_name LIKE ? ESCAPE '@'").pluck().all(downcased + "%")
	// Keep generating until we get a suggestion that doesn't conflict
	for (const suggestion of generateLocalpartAlternatives(preferences)) {
		if (!matches.includes(suggestion)) return suggestion
	}
	/* c8 ignore next */
	throw new Error(`Ran out of suggestions when generating sim name. downcased: "${downcased}"`)
}

module.exports.userToSimName = userToSimName
