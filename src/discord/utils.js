// @ts-check

const DiscordTypes = require("discord-api-types/v10")
const assert = require("assert").strict

const {reg} = require("../matrix/read-registration")

const {db, select} = require("../passthrough")

/** @type {import("xxhash-wasm").XXHashAPI} */ // @ts-ignore
let hasher = null
// @ts-ignore
require("xxhash-wasm")().then(h => hasher = h)

const EPOCH = 1420070400000

/**
 * @param {string} guildID
 * @param {string[]} userRoles
 * @param {DiscordTypes.APIGuild["roles"]} guildRoles
 * @param {string} [userID]
 * @param {DiscordTypes.APIGuildChannel["permission_overwrites"]} [channelOverwrites]
 */
function getPermissions(guildID, userRoles, guildRoles, userID, channelOverwrites) {
	let allowed = BigInt(0)
	// Guild allows
	for (const role of guildRoles) {
		if (role.id === guildID) {
			allowed |= BigInt(role.permissions)
		}
		if (userRoles.includes(role.id)) {
			allowed |= BigInt(role.permissions)
		}
	}

	if (channelOverwrites) {
		/** @type {((overwrite: Required<DiscordTypes.APIOverwrite>) => any)[]} */
		const actions = [
			// Channel @everyone deny
			overwrite => overwrite.id === guildID && (allowed &= ~BigInt(overwrite.deny)),
			// Channel @everyone allow
			overwrite => overwrite.id === guildID && (allowed |= BigInt(overwrite.allow)),
			// Role deny
			overwrite => userRoles.includes(overwrite.id) && (allowed &= ~BigInt(overwrite.deny)),
			// Role allow
			overwrite => userRoles.includes(overwrite.id) && (allowed |= BigInt(overwrite.allow)),
			// User deny
			overwrite => overwrite.id === userID && (allowed &= ~BigInt(overwrite.deny)),
			// User allow
			overwrite => overwrite.id === userID && (allowed |= BigInt(overwrite.allow))
		]
		for (let i = 0; i < actions.length; i++) {
			for (const overwrite of channelOverwrites) {
				actions[i](overwrite)
			}
		}
	}
	return allowed
}

/**
 * @param {{id: string, roles: DiscordTypes.APIGuild["roles"]}} guild
 * @param {DiscordTypes.APIGuildChannel["permission_overwrites"]} [channel]
 */
function getDefaultPermissions(guild, channel) {
	const defaultRoles = select("role_default", "role_id", {guild_id: guild.id}).pluck().all()
	return getPermissions(guild.id, defaultRoles, guild.roles, undefined, channel)
}

/**
 * Note: You can only provide one permission bit to permissionToCheckFor. To check multiple permissions, call `hasAllPermissions` or `hasSomePermissions`.
 * It is designed like this to avoid developer error with bit manipulations.
 *
 * @param {bigint} resolvedPermissions
 * @param {bigint} permissionToCheckFor
 * @returns {boolean} whether the user has the requested permission
 * @example
 * const permissions = getPermissions(userRoles, guildRoles, userID, channelOverwrites)
 * hasPermission(permissions, DiscordTypes.PermissionFlagsBits.ViewChannel)
 */
function hasPermission(resolvedPermissions, permissionToCheckFor) {
	// Make sure permissionToCheckFor has exactly one permission in it
	assert.equal(permissionToCheckFor.toString(2).match(/1/g)?.length, 1)
	// Do the actual calculation
	return (resolvedPermissions & permissionToCheckFor) === permissionToCheckFor
}

/**
 * @param {bigint} resolvedPermissions
 * @param {(keyof DiscordTypes.PermissionFlagsBits)[]} permissionsToCheckFor
 * @returns {boolean} whether the user has any of the requested permissions
 * @example
 * const permissions = getPermissions(userRoles, guildRoles, userID, channelOverwrites)
 * hasSomePermissions(permissions, ["ViewChannel", "ReadMessageHistory"])
 */
function hasSomePermissions(resolvedPermissions, permissionsToCheckFor) {
	return permissionsToCheckFor.some(x => hasPermission(resolvedPermissions, DiscordTypes.PermissionFlagsBits[x]))
}

/**
 * @param {bigint} resolvedPermissions
 * @param {(keyof DiscordTypes.PermissionFlagsBits)[]} permissionsToCheckFor
 * @returns {boolean} whether the user has all of the requested permissions
 * @example
 * const permissions = getPermissions(userRoles, guildRoles, userID, channelOverwrites)
 * hasAllPermissions(permissions, ["ViewChannel", "ReadMessageHistory"])
 */
function hasAllPermissions(resolvedPermissions, permissionsToCheckFor) {
	return permissionsToCheckFor.every(x => hasPermission(resolvedPermissions, DiscordTypes.PermissionFlagsBits[x]))
}

/**
 * Command interaction responses have a webhook_id for some reason, but still have real author info of a real bot user in the server.
 * @param {DiscordTypes.APIMessage} message
 */
function isWebhookMessage(message) {
	return message.webhook_id && message.type !== DiscordTypes.MessageType.ChatInputCommand && message.type !== DiscordTypes.MessageType.ContextMenuCommand
}

/**
 * @param {Pick<DiscordTypes.APIMessage, "flags">} message
 */
function isEphemeralMessage(message) {
	return Boolean(message.flags && (message.flags & DiscordTypes.MessageFlags.Ephemeral))
}

/** @param {string} snowflake */
function snowflakeToTimestampExact(snowflake) {
	return Number(BigInt(snowflake) >> 22n) + EPOCH
}

/** @param {number} timestamp */
function timestampToSnowflakeInexact(timestamp) {
	return String((timestamp - EPOCH) * 2**22)
}

/** @param {string} url */
function getPublicUrlForCdn(url) {
	const match = url.match(/https:\/\/(cdn|media)\.discordapp\.(?:com|net)\/attachments\/([0-9]+)\/([0-9]+)\/([-A-Za-z0-9_.,]+)/)
	if (!match) return url
	const unsignedHash = hasher.h64(match[3]) // attachment ID
	const signedHash = unsignedHash - 0x8000000000000000n // shifting down to signed 64-bit range
	db.prepare("INSERT OR IGNORE INTO media_proxy (permitted_hash) VALUES (?)").run(signedHash)
	return `${reg.ooye.bridge_origin}/download/discord${match[1]}/${match[2]}/${match[3]}/${match[4]}`
}

/**
 * @param {string} oldTimestamp
 * @param {string} newTimestamp
 * @returns {string} "a x-day-old unbridged message"
 */
function howOldUnbridgedMessage(oldTimestamp, newTimestamp) {
	const dateDifference = new Date(newTimestamp).getTime() - new Date(oldTimestamp).getTime()
	const oneHour = 60 * 60 * 1000
	if (dateDifference < oneHour) {
		return "an unbridged message"
	} else if (dateDifference < 25 * oneHour) {
		var dateDisplay = `a ${Math.floor(dateDifference / oneHour)}-hour-old unbridged message`
	} else {
		var dateDisplay = `a ${Math.round(dateDifference / (24 * oneHour))}-day-old unbridged message`
	}
	return dateDisplay
}

/**
 * Modifies the input, removing items that don't pass the filter. Returns the items that didn't pass.
 * @param {T[]} xs
 * @param {(x: T, i?: number) => any} fn
 * @template T
 * @returns T[]
 */
function filterTo(xs, fn) {
	/** @type {T[]} */
	const filtered = []
	for (let i = xs.length-1; i >= 0; i--) {
		const x = xs[i]
		if (!fn(x, i)) {
			filtered.unshift(x)
			xs.splice(i, 1)
		}
	}
	return filtered
}

/**
 * The parameters correspond to the columns of the channel_room table.
 * @param {string} rowChannelID thread ID, OR channel ID if there is no thread
 * @param {string | null | undefined} rowThreadParent channel ID if there is a thread
 */
function swapThreadID(rowChannelID, rowThreadParent) {
	return {
		channelID: rowThreadParent ? rowThreadParent : rowChannelID,
		threadID: rowThreadParent ? rowChannelID : undefined
	}
}

const supportedPlaintextPreviewExtensions = new Set([
	"4d",
	"abnf",
	"accesslog",
	"actionscript",
	"ada",
	"adoc",
	"alan",
	"angelscript",
	"ansi",
	"apache",
	"apacheconf",
	"applescript",
	"arcade",
	"arduino",
	"arm",
	"armasm",
	"as",
	"asc",
	"asciidoc",
	"aspectj",
	"ass",
	"atom",
	"autohotkey",
	"autoit",
	"avrasm",
	"awk",
	"axapta",
	"bash",
	"basic",
	"bat",
	"bbcode",
	"bf",
	"bind",
	"blade",
	"bnf",
	"brainfuck",
	"c",
	"c++",
	"cal",
	"capnp",
	"capnproto",
	"cc",
	"chaos",
	"chapel",
	"chpl",
	"cisco",
	"clj",
	"clojure",
	"cls",
	"cmake.in",
	"cmake",
	"cmd",
	"coffee",
	"coffeescript",
	"console",
	"coq",
	"cos",
	"cpc",
	"cpp",
	"cr",
	"craftcms",
	"crm",
	"crmsh",
	"crystal",
	"cs",
	"csharp",
	"cshtml",
	"cson",
	"csp",
	"css",
	"csv",
	"cxx",
	"cypher",
	"d",
	"dart",
	"delphi",
	"dfm",
	"diff",
	"django",
	"dns",
	"docker",
	"dockerfile",
	"dos",
	"dpr",
	"dsconfig",
	"dst",
	"dts",
	"dust",
	"dylan",
	"ebnf",
	"elixir",
	"elm",
	"erl",
	"erlang",
	"ex",
	"extempore",
	"f90",
	"f95",
	"fix",
	"fortran",
	"freepascal",
	"fs",
	"fsharp",
	"gams",
	"gauss",
	"gawk",
	"gcode",
	"gdscript",
	"gemspec",
	"gf",
	"gherkin",
	"glsl",
	"gms",
	"gn",
	"gni",
	"go",
	"godot",
	"golang",
	"golo",
	"gololang",
	"gradle",
	"graph",
	"groovy",
	"gss",
	"gyp",
	"h",
	"h++",
	"haml",
	"handlebars",
	"haskell",
	"haxe",
	"hbs",
	"hcl",
	"hh",
	"hpp",
	"hs",
	"html.handlebars",
	"html.hbs",
	"html",
	"http",
	"https",
	"hx",
	"hxx",
	"hy",
	"hylang",
	"i",
	"i7",
	"iced",
	"iecst",
	"inform7",
	"ini",
	"ino",
	"instances",
	"iol",
	"irb",
	"irpf90",
	"java",
	"javascript",
	"jinja",
	"jolie",
	"js",
	"json",
	"jsp",
	"jsx",
	"julia-repl",
	"julia",
	"k",
	"kaos",
	"kdb",
	"kotlin",
	"kt",
	"lasso",
	"lassoscript",
	"lazarus",
	"ldif",
	"leaf",
	"lean",
	"less",
	"lfm",
	"lisp",
	"livecodeserver",
	"livescript",
	"ln",
	"lock",
	"log",
	"lpr",
	"ls",
	"ls",
	"lua",
	"mak",
	"make",
	"makefile",
	"markdown",
	"mathematica",
	"matlab",
	"mawk",
	"maxima",
	"md",
	"mel",
	"mercury",
	"mirc",
	"mizar",
	"mk",
	"mkd",
	"mkdown",
	"ml",
	"ml",
	"mm",
	"mma",
	"mojolicious",
	"monkey",
	"moon",
	"moonscript",
	"mrc",
	"n1ql",
	"nawk",
	"nc",
	"never",
	"nginx",
	"nginxconf",
	"nim",
	"nimrod",
	"nix",
	"nsis",
	"obj-c",
	"obj-c++",
	"objc",
	"objective-c++",
	"objectivec",
	"ocaml",
	"ocl",
	"ol",
	"openscad",
	"osascript",
	"oxygene",
	"p21",
	"parser3",
	"pas",
	"pascal",
	"patch",
	"pcmk",
	"perl",
	"pf.conf",
	"pf",
	"pgsql",
	"php",
	"php3",
	"php4",
	"php5",
	"php6",
	"php7",
	"pl",
	"plaintext",
	"plist",
	"pm",
	"podspec",
	"pony",
	"postgres",
	"postgresql",
	"powershell",
	"pp",
	"processing",
	"profile",
	"prolog",
	"properties",
	"proto",
	"protobuf",
	"ps",
	"ps1",
	"puppet",
	"py",
	"pycon",
	"python-repl",
	"python",
	"qml",
	"r",
	"razor-cshtml",
	"razor",
	"rb",
	"re",
	"reasonml",
	"rebol",
	"red-system",
	"red",
	"redbol",
	"rf",
	"rib",
	"robot",
	"rpm-spec",
	"rpm-specfile",
	"rpm",
	"rs",
	"rsl",
	"rss",
	"ruby",
	"ruleslanguage",
	"rust",
	"sas",
	"SAS",
	"sc",
	"scad",
	"scala",
	"scheme",
	"sci",
	"scilab",
	"scl",
	"scss",
	"sh",
	"shell",
	"shexc",
	"smali",
	"smalltalk",
	"sml",
	"sol",
	"solidity",
	"spec",
	"specfile",
	"sql",
	"srt",
	"ssa",
	"st",
	"stan",
	"stanfuncs",
	"stata",
	"step",
	"stp",
	"structured-text",
	"styl",
	"stylus",
	"subunit",
	"supercollider",
	"svelte",
	"svg",
	"swift",
	"tao",
	"tap",
	"tcl",
	"terraform",
	"tex",
	"text",
	"tf",
	"thor",
	"thrift",
	"tk",
	"toml",
	"tp",
	"ts",
	"tsql",
	"tsx",
	"ttml",
	"twig",
	"txt",
	"typescript",
	"unicorn-rails-log",
	"v",
	"vala",
	"vb",
	"vba",
	"vbnet",
	"vbs",
	"vbscript",
	"verilog",
	"vhdl",
	"vim",
	"vtt",
	"wl",
	"x++",
	"x86asm",
	"xhtml",
	"xjb",
	"xl",
	"xml",
	"xpath",
	"xq",
	"xquery",
	"xsd",
	"xsl",
	"xtlang",
	"xtm",
	"yaml",
	"yml",
	"zep",
	"zephir",
	"zone",
	"zsh"
])

module.exports.getPermissions = getPermissions
module.exports.getDefaultPermissions = getDefaultPermissions
module.exports.hasPermission = hasPermission
module.exports.hasSomePermissions = hasSomePermissions
module.exports.hasAllPermissions = hasAllPermissions
module.exports.isWebhookMessage = isWebhookMessage
module.exports.isEphemeralMessage = isEphemeralMessage
module.exports.snowflakeToTimestampExact = snowflakeToTimestampExact
module.exports.timestampToSnowflakeInexact = timestampToSnowflakeInexact
module.exports.getPublicUrlForCdn = getPublicUrlForCdn
module.exports.howOldUnbridgedMessage = howOldUnbridgedMessage
module.exports.filterTo = filterTo
module.exports.swapThreadID = swapThreadID
module.exports.supportedPlaintextPreviewExtensions = supportedPlaintextPreviewExtensions
