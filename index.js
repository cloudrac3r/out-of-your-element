const repl = require("repl")
const util = require("util")

const DiscordClient = require("./modules/DiscordClient")

const config = require("./config")

const discord = new DiscordClient(config.discordToken)

discord.cloud.connect().then(() => console.log("Discord gateway started"))

/**
 * @param {string} input
 * @param {import("vm").Context} _context
 * @param {string} _filename
 * @param {(err: Error | null, result: unknown) => unknown} callback
 * @returns
 */
async function customEval(input, _context, _filename, callback) {
	let depth = 0
	if (input === "exit\n") return process.exit()
	if (input.startsWith(":")) {
		const depthOverwrite = input.split(" ")[0]
		depth = +depthOverwrite.slice(1)
		input = input.slice(depthOverwrite.length + 1)
	}
	/** @type {unknown} */
	let result
	try {
		result = await eval(input)
		const output = util.inspect(result, false, depth, true)
		return callback(null, output)
	} catch (e) {
		return callback(e, undefined)
	}
}

const cli = repl.start({ prompt: "", eval: customEval, writer: s => s })
cli.once("exit", process.exit)
