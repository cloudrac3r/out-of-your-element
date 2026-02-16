// @ts-check

const assert = require("assert")
const fs = require("fs")
const {join} = require("path")
const h3 = require("h3")
const mimeTypes = require("mime-types")
const {defineEventHandler, defaultContentType, getRequestHeader, setResponseHeader, handleCacheHeaders, serveStatic} = h3
const icons = require("@stackoverflow/stacks-icons")
const DiscordTypes = require("discord-api-types/v10")
const dUtils = require("../discord/utils")
const reg = require("../matrix/read-registration")

const {sync, discord, as, select, from} = require("../passthrough")
/** @type {import("./pug-sync")} */
const pugSync = sync.require("./pug-sync")
/** @type {import("../matrix/utils")} */
const mUtils = sync.require("../matrix/utils")
const {id} = require("../../addbot")

// Pug

pugSync.addGlobals({id, h3, discord, select, from, DiscordTypes, dUtils, mUtils, icons, reg: reg.reg})

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

as.router.get("/download/file/poll-star-avatar.png", defineEventHandler(event => {
	handleCacheHeaders(event, {maxAge: 86400})
	return fs.promises.readFile(join(__dirname, "../../docs/img/poll-star-avatar.png"))
}))

// Custom files

const publicDir = "custom-webroot"

/**
 * @param {h3.H3Event} event
 * @param {boolean} fallthrough
 */
function tryStatic(event, fallthrough) {
	return serveStatic(event, {
		indexNames: ["/index.html", "/index.pug"],
		fallthrough,
		getMeta: async id => {
			// Check
			const stats = await fs.promises.stat(join(publicDir, id)).catch(() => {});
			if (!stats || !stats.isFile()) {
				return
			}
			// Pug
			if (id.match(/\.pug$/)) {
				defaultContentType(event, "text/html; charset=utf-8")
				return {}
			}
			// Everything else
			else {
				const mime = mimeTypes.lookup(id)
				if (typeof mime === "string") defaultContentType(event, mime)
				return {
					size: stats.size
				}
			}
		},
		getContents: id => {
			if (id.match(/\.pug$/)) {
				const path = join(publicDir, id)
				return pugSync.renderPath(event, path, {})
			} else {
				return fs.promises.readFile(join(publicDir, id))
			}
		}
	})
}

as.router.get("/**", defineEventHandler(event => {
	return tryStatic(event, false)
}))

as.router.get("/", defineEventHandler(async event => {
	return (await tryStatic(event, true)) || pugSync.render(event, "home.pug", {})
}))

as.router.get("/icon.png", defineEventHandler(async event => {
	const s = await tryStatic(event, true)
	if (s) return s
	handleCacheHeaders(event, {maxAge: 86400})
	return fs.promises.readFile(join(__dirname, "../../docs/img/icon.png"))
}))

// Routes

pugSync.createRoute(as.router, "/ok", "ok.pug")

sync.require("./routes/download-matrix")
sync.require("./routes/download-discord")
sync.require("./routes/guild-settings")
sync.require("./routes/guild")
sync.require("./routes/info")
sync.require("./routes/link")
sync.require("./routes/log-in-with-matrix")
sync.require("./routes/oauth")
sync.require("./routes/password")
