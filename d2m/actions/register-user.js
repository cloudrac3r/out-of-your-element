// @ts-check

const assert = require("assert")

const passthrough = require("../../passthrough")
const { discord, sync, db } = passthrough
/** @type {import("../../matrix/mreq")} */
const mreq = sync.require("../../matrix/mreq")
/** @type {import("../../matrix/file")} */
const file = sync.require("../../matrix/file")

async function registerUser(username) {
	assert.ok(username.startsWith("_ooye_"))
	/** @type {import("../../types").R.Registered} */
	const res = await mreq.mreq("POST", "/client/v3/register", {
		type: "m.login.application_service",
		username
	})
	return res
}

/**
 * A sim is an account that is being simulated by the bridge to copy events from the other side.
 * @param {import("discord-api-types/v10").APIUser} user
 */
async function createSim(user) {
	assert.notEqual(user.discriminator, "0000", "user is not a webhook")
	fetch("https://matrix.cadence.moe/_matrix/client/v3/register", {
		method: "POST",
		body: JSON.stringify({
			type: "m.login.application_service",
			username: "_ooye_example"
		}),
		headers: {
			Authorization: `Bearer ${reg.as_token}`
		}
	}).then(res => res.text()).then(text => {

		console.log(text)
	}).catch(err => {
		console.log(err)
	})
