// @ts-check

const assert = require("assert")
const fs = require("fs")
const {join} = require("path")
const h3 = require("h3")
const {defineEventHandler, defaultContentType, getRequestHeader, setResponseHeader, handleCacheHeaders} = h3
const icons = require("@stackoverflow/stacks-icons")
const DiscordTypes = require("discord-api-types/v10")
const dUtils = require("../discord/utils")
const reg = require("../matrix/read-registration")

const {sync, discord, as, select} = require("../passthrough")
/** @type {import("./pug-sync")} */
const pugSync = sync.require("./pug-sync")
/** @type {import("../m2d/converters/utils")} */
const mUtils = sync.require("../m2d/converters/utils")
const {id} = require("../../addbot")

// Pug

pugSync.addGlobals({id, h3, discord, select, DiscordTypes, dUtils, mUtils, icons, reg: reg.reg})
pugSync.createRoute(as.router, "/", "home.pug")
pugSync.createRoute(as.router, "/ok", "ok.pug")

// Routes

sync.require("./routes/download-matrix")
sync.require("./routes/download-discord")
sync.require("./routes/guild-settings")
sync.require("./routes/guild")
sync.require("./routes/info")
sync.require("./routes/link")
sync.require("./routes/log-in-with-matrix")
sync.require("./routes/oauth")
sync.require("./routes/password")

// Files

function compressResponse(event, response) {
	if (!getRequestHeader(event, "accept-encoding")?.includes("gzip")) return
	/* c8 ignore next */
	if (typeof response.body !== "string") return
	const stream = new Response(response.body).body
	assert(stream)
	setResponseHeader(event, "content-encoding", "gzip")
	response.body = stream.pipeThrough(new CompressionStream("gzip"))
}

as.router.get("/static/stacks.min.css", defineEventHandler({
	onBeforeResponse: compressResponse,
	handler: async event => {
		handleCacheHeaders(event, {maxAge: 86400})
		defaultContentType(event, "text/css")
		return fs.promises.readFile(require.resolve("@stackoverflow/stacks/dist/css/stacks.css"), "utf-8")
	}
}))

as.router.get("/static/htmx.js", defineEventHandler({
	onBeforeResponse: compressResponse,
	handler: async event => {
		handleCacheHeaders(event, {maxAge: 86400})
		defaultContentType(event, "text/javascript")
		return fs.promises.readFile(require.resolve("htmx.org/dist/htmx.js"), "utf-8")
	}
}))

as.router.get("/icon.png", defineEventHandler(event => {
	handleCacheHeaders(event, {maxAge: 86400})
	return fs.promises.readFile(join(__dirname, "../../docs/img/icon.png"))
}))
