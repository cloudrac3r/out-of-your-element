// @ts-check

const assert = require("assert/strict")
const fs = require("fs")
const util = require("util")
const {join} = require("path")
const getRelativePath = require("get-relative-path")
const h3 = require("h3")
const {defineEventHandler, defaultContentType, setResponseStatus, getQuery, getRequestURL} = h3
const {compileFile} = require("@cloudrac3r/pug")
const walkAST = require("pug-walk")
const pretty = process.argv.join(" ").includes("test")

const {sync} = require("../passthrough")
/** @type {import("./auth")} */
const auth = sync.require("./auth")
/** @type {import("../js/errors")} */
const errors = sync.require("../js/errors")

// Pug

let globals = sync.remember(() => ({}))

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
	return renderFragments(event, filename, null, locals)
}

/**
 * @param {import("h3").H3Event} event
 * @param {string} filename
 * @param {string[] | null} fragments
 * @param {Record<string, any>} locals
 */
function renderFragments(event, filename, fragments, locals) {
	const path = join(__dirname, "pug", filename)
	return renderPath(event, path, fragments, locals)
}

/**
 * @param {string[] | null} fragments
 * @param {string[]} requiresOut
 */
function fragmentSelectorPlugins(fragments, requiresOut) {
	if (!fragments) return []
	return [{
		parse: true,
		postParse(ast, options) {
			const found = []
			walkAST(ast, (node, replace) => {
				if (node.type === "NamedBlock") {
					const [name, requires] = node.name.split("requires").map(x => x.trim())
					// console.log(name, "|", requires)
					if (fragments?.includes(name)) {
						if (requires) requiresOut.push(...requires.split(",").map(x => x.trim()))
						found.push(node)
					}
				}
			})
			// console.log(util.inspect(found, false, 9, true))
			return {type: "Block", nodes: found, line: 0, filename: found[0].filename}
		}
	}]
}

/**
 * @param {import("h3").H3Event} event
 * @param {string} path
 * @param {string[] | null} fragments
 * @param {Record<string, any>} locals
 */
function renderPath(event, path, fragments, locals) {
	const cacheKey = path + (fragments ? fragments.map(f => `#${f}`).join("") : "")

	function compile() {
		try {
			const requiredVars = []
			const template = compileFile(path, {pretty, plugins: fragmentSelectorPlugins(fragments, requiredVars)})
			pugCache.set(cacheKey, async (event, locals) => {
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
				const templateVars = Object.assign({},
					getQuery(event), // Query parameters can be easily accessed on the top level but don't allow them to overwrite anything
					globals, // Globals
					locals, // Explicit locals overwrite globals in case we need to DI something
					{session, event, rel, managed} // These are assigned last so they overwrite everything else. It would be catastrophically bad if they can't be trusted.
				)
				// Verify all fragment block required variables are present
				for (const key of requiredVars) {
					if (templateVars[key] === undefined) {
						setResponseStatus(event, 500, "Internal Template Variables Error")
						defaultContentType(event, "text/plain")
						return `requested fragments ${JSON.stringify(fragments)}\nrequire variables ${JSON.stringify(requiredVars)}\nbut "${key}" is ${templateVars[key]} (present: ${key in templateVars})`
					}
				}
				try {
					const content = template(templateVars)
					defaultContentType(event, "text/html; charset=utf-8")
					return content
				} catch (e) {
					console.error(e)
					setResponseStatus(event, 500, "Internal Template Rendering Error")
					defaultContentType(event, "text/plain")
					e.url = getRequestURL(event).toString()
					return errors.stringifyErrorStack(e)
				}
			})
		/* c8 ignore start */
		} catch (e) {
			pugCache.set(cacheKey, async (event) => {
				console.error(e)
				setResponseStatus(event, 500, "Internal Template Error")
				defaultContentType(event, "text/plain")
				return e.toString()
			})
		}
		/* c8 ignore stop */
	}

	if (!pugCache.has(cacheKey)) {
		compile()
		const ac = new AbortController()
		const {signal} = ac
		fs.watch(path, {persistent: false, signal}, compile)
		fs.watch(join(__dirname, "pug", "includes"), {persistent: false, signal}, compile)
		sync.events.once(__filename, () => ac.abort())
	}

	const cb = pugCache.get(cacheKey)
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
module.exports.renderFragments = renderFragments
module.exports.renderPath = renderPath
module.exports.createRoute = createRoute
