// @ts-check

const assert = require("assert")

const passthrough = require("../../passthrough")
const { discord, sync, db } = passthrough
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")

/**
 * A sim is an account that is being simulated by the bridge to copy events from the other side.
 * @param {import("discord-api-types/v10").APIUser} user
 */
async function createSim(user) {
	assert.notEqual(user.discriminator, "0000", "user is not a webhook")
	api.register("_ooye_example")
}
