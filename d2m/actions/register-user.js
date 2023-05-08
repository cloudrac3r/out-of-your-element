// @ts-check

const assert = require("assert")

const passthrough = require("../../passthrough")
const { discord, sync, db } = passthrough
/** @type {import("../../matrix/api")} */
const api = sync.require("../../matrix/api")
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")
/** @type {import("../converters/user-to-mxid")} */
const userToMxid = sync.require("../converters/user-to-mxid")

/**
 * A sim is an account that is being simulated by the bridge to copy events from the other side.
 * @param {import("discord-api-types/v10").APIUser} user
 */
async function createSim(user) {
	const simName = userToMxid.userToSimName(user)
	const appservicePrefix = "_ooye_"
	const localpart = appservicePrefix + simName
	await api.register(localpart)
}
