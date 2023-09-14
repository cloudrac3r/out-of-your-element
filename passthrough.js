// @ts-check

/**
 * @typedef {Object} Passthrough
 * @property {import("repl").REPLServer} repl
 * @property {typeof import("./config")} config
 * @property {import("./d2m/discord-client")} discord
 * @property {import("heatsync")} sync
 * @property {import("better-sqlite3/lib/database")} db
 * @property {import("matrix-appservice").AppService} as
 * @property {import("./db/orm").from} from
 * @property {import("./db/orm").select} select
 */
/** @type {Passthrough} */
// @ts-ignore
const pt = {}
module.exports = pt
