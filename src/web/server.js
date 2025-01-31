// @ts-check

const fs = require("fs")
const {join} = require("path")
const h3 = require("h3")
const {defineEventHandler, defaultContentType, getRequestHeader, setResponseHeader, setResponseStatus, useSession, getQuery, handleCacheHeaders} = h3
const icons = require("@stackoverflow/stacks-icons")
const DiscordTypes = require("discord-api-types/v10")
const dUtils = require("../discord/utils")

const {sync, discord, as, select} = require("../passthrough")
/** @type {import("./pug-sync")} */
const pugSync = sync.require("./pug-sync")
const {id} = require("../../addbot")

// Pug

pugSync.addGlobals({id, h3, discord, select, DiscordTypes, dUtils, icons})
pugSync.createRoute(as.router, "/", "home.pug")
pugSync.createRoute(as.router, "/ok", "ok.pug")

// Routes

sync.require("./routes/download-matrix")
sync.require("./routes/download-discord")
sync.require("./routes/guild-settings")
sync.require("./routes/guild")
sync.require("./routes/link")
sync.require("./routes/oauth")

// Files

function compressResponse(event, response) {
	if (!getRequestHeader(event, "accept-encoding")?.includes("gzip")) return
	/* c8 ignore next */
	if (typeof response.body !== "string") return
	/** @type {ReadableStream} */ // @ts-ignore
	const stream = new Response(response.body).body
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
		return fs.promises.readFile(join(__dirname, "static", "htmx.js"), "utf-8")
	}
}))

as.router.get("/icon.png", defineEventHandler(event => {
	handleCacheHeaders(event, {maxAge: 86400})
	return fs.promises.readFile(join(__dirname, "../../docs/img/icon.png"))
}))
