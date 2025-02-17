// @ts-check

const assert = require("assert/strict")
const fs = require("fs")
const {join} = require("path")
const getRelativePath = require("get-relative-path")
const h3 = require("h3")
const {defineEventHandler, defaultContentType, setResponseStatus, getQuery} = h3
const {compileFile} = require("@cloudrac3r/pug")
const pretty = process.argv.join(" ").includes("test")

const {sync} = require("../passthrough")
/** @type {import("./auth")} */
const auth = sync.require("./auth")

// Pug

let globals = {}

/** @type {Map<string, (event: import("h3").H3Event, locals: Record<string, any>) => Promise<string>>} */
const pugCache = new Map()

function addGlobals(obj) {
	Object.assign(globals, obj)
}

/**
 * @param {import("h3").H3Event} event
 * @param {string} filename
 * @param {Record<string, any>} locals
 */
function render(event, filename, locals) {
	const path = join(__dirname, "pug", filename)

	function compile() {
		try {
			const template = compileFile(path, {pretty})
			pugCache.set(path, async (event, locals) => {
				defaultContentType(event, "text/html; charset=utf-8")
				const session = await auth.useSession(event)
				const managed = await auth.getManagedGuilds(event)
				const rel = (to, paramsObject) => {
					let result = getRelativePath(event.path, to)
					if (paramsObject) {
						const params = new URLSearchParams(paramsObject)
						result += "?" + params.toString()
					}
					return result
				}
				return template(Object.assign({},
					getQuery(event), // Query parameters can be easily accessed on the top level but don't allow them to overwrite anything
					globals, // Globals
					locals, // Explicit locals overwrite globals in case we need to DI something
					{session, event, rel, managed} // These are assigned last so they overwrite everything else. It would be catastrophically bad if they can't be trusted.
				))
			})
		/* c8 ignore start */
		} catch (e) {
			pugCache.set(path, async (event) => {
				setResponseStatus(event, 500, "Internal Template Error")
				defaultContentType(event, "text/plain")
				return e.toString()
			})
		}
		/* c8 ignore stop */
	}

	if (!pugCache.has(path)) {
		compile()
		fs.watch(path, {persistent: false}, compile)
		fs.watch(join(__dirname, "pug", "includes"), {persistent: false}, compile)
	}

	const cb = pugCache.get(path)
	assert(cb)
	return cb(event, locals)
}

/**
 * @param {import("h3").Router} router
 * @param {string} url
 * @param {string} filename
 */
function createRoute(router, url, filename) {
	router.get(url, defineEventHandler(async event => {
		return render(event, filename, {})
	}))
}

module.exports.addGlobals = addGlobals
module.exports.render = render
module.exports.createRoute = createRoute
