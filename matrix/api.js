// @ts-check

const passthrough = require("../passthrough")
const { discord, sync, db } = passthrough
/** @type {import("./mreq")} */
const mreq = sync.require("./mreq")
/** @type {import("./file")} */
const file = sync.require("./file")

/**
 * @returns {Promise<import("../types").R.Registered>}
 */
function register(username) {
   return mreq.mreq("POST", "/client/v3/register", {
      type: "m.login.application_service",
      username
   })
}

module.exports.register = register