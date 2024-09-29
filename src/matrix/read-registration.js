// @ts-check

const fs = require("fs")
const crypto = require("crypto")
const assert = require("assert").strict
const path = require("path")

const registrationFilePath = path.join(process.cwd(), "registration.yaml")

/** @param {import("../types").AppServiceRegistrationConfig} reg */
function checkRegistration(reg) {
	reg["ooye"].invite = reg.ooye.invite.filter(mxid => mxid.endsWith(`:${reg.ooye.server_name}`)) // one day I will understand why typescript disagrees with dot notation on this line
	assert(reg.ooye?.max_file_size)
	assert(reg.ooye?.namespace_prefix)
	assert(reg.ooye?.server_name)
	assert(reg.sender_localpart?.startsWith(reg.ooye.namespace_prefix), "appservice's localpart must be in the namespace it controls")
	assert(reg.ooye?.server_origin.match(/^https?:\/\//), "server origin must start with http or https")
	assert.notEqual(reg.ooye?.server_origin.slice(-1), "/", "server origin must not end in slash")
	assert.match(reg.url, /^https?:/, "url must start with http:// or https://")
}

/* c8 ignore next 4 */
/** @param {import("../types").AppServiceRegistrationConfig} reg */
function writeRegistration(reg) {
	fs.writeFileSync(registrationFilePath, JSON.stringify(reg, null, 2))
}

/**
 * @param {string} serverName
 * @returns {import("../types").InitialAppServiceRegistrationConfig} reg
 */
function getTemplateRegistration(serverName) {
	const namespace_prefix = "_ooye_"
	return {
		id: "ooye",
		as_token: crypto.randomBytes(32).toString("hex"),
		hs_token: crypto.randomBytes(32).toString("hex"),
		namespaces: {
			users: [{
				exclusive: true,
				regex: `@${namespace_prefix}.*:${serverName}`
			}],
			aliases: [{
				exclusive: true,
				regex: `#${namespace_prefix}.*:${serverName}`
			}]
		},
		protocols: [
			"discord"
		],
		sender_localpart: `${namespace_prefix}bot`,
		rate_limited: false,
		socket: 6693,
		ooye: {
			namespace_prefix,
			server_name: serverName,
			max_file_size: 5000000,
			content_length_workaround: false,
			include_user_id_in_mxid: false,
			invite: []
		}
	}
}

function readRegistration() {
	/** @type {import("../types").AppServiceRegistrationConfig} */ // @ts-ignore
	let result = null
	try {
		const content = fs.readFileSync(registrationFilePath, "utf8")
		result = JSON.parse(content)
		result.ooye.invite ||= []
	/* c8 ignore next */
	} catch (e) {}
	return result
}

/** @type {import("../types").AppServiceRegistrationConfig} */ // @ts-ignore
let reg = readRegistration()

module.exports.registrationFilePath = registrationFilePath
module.exports.readRegistration = readRegistration
module.exports.getTemplateRegistration = getTemplateRegistration
module.exports.writeRegistration = writeRegistration
module.exports.checkRegistration = checkRegistration
module.exports.reg = reg
