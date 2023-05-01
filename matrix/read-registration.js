// @ts-check

const fs = require("fs")
const yaml = require("js-yaml")

/** 
 * @typedef AppServiceRegistrationConfig
 * @property {string} id
 * @property {string} as_token
 * @property {string} hs_token
 */

module.exports = yaml.load(fs.readFileSync("registration.yaml", "utf8"))
