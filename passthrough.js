/**
 * @typedef {Object} Passthrough
 * @property {import("repl").REPLServer} repl
 * @property {typeof import("./config")} config
 * @property {import("./modules/DiscordClient")} discord
 * @property {import("heatsync")} sync
 */
/** @type {Passthrough} */
const pt = {}
module.exports = pt
