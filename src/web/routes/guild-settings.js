// @ts-check

const assert = require("assert/strict")
const {z} = require("zod")
const {defineEventHandler, createError, readValidatedBody, getRequestHeader, setResponseHeader, sendRedirect, H3Event} = require("h3")

const {as, db, sync, select} = require("../../passthrough")

/** @type {import("../auth")} */
const auth = sync.require("../auth")
/** @type {import("../../d2m/actions/set-presence")} */
const setPresence = sync.require("../../d2m/actions/set-presence")

/**
 * @param {H3Event} event
 * @returns {import("../../d2m/actions/create-space")}
 */
function getCreateSpace(event) {
	/* c8 ignore next */
	return event.context.createSpace || sync.require("../../d2m/actions/create-space")
}

/**
 * @typedef Options
 * @prop {(value: string?) => number} transform
 * @prop {(event: H3Event, guildID: string) => any} [after]
 * @prop {keyof import("../../db/orm-defs").Models} table
 */

/**
 * @template {string} T
 * @param {T} key
 * @param {Partial<Options>} [inputOptions]
 */
function defineToggle(key, inputOptions) {
	/** @type {Options} */
	const options = {
		transform: x => +!!x, // convert toggle to 0 or 1
		table: "guild_space"
	}
	Object.assign(options, inputOptions)
	return defineEventHandler(async event => {
		const bodySchema = z.object({
			guild_id: z.string(),
			[key]: z.string().optional()
		})
		/** @type {Record<T, string?> & Record<"guild_id", string> & Record<string, unknown>} */ // @ts-ignore
		const parsedBody = await readValidatedBody(event, bodySchema.parse)
		const managed = await auth.getManagedGuilds(event)
		if (!managed.has(parsedBody.guild_id)) throw createError({status: 403, message: "Forbidden", data: "Can't change settings for a guild you don't have Manage Server permissions in"})

		const value = options.transform(parsedBody[key])
		assert(typeof value === "number")
		db.prepare(`UPDATE ${options.table} SET ${key} = ? WHERE guild_id = ?`).run(value, parsedBody.guild_id)

		return (options.after && await options.after(event, parsedBody.guild_id)) || null
	})
}

as.router.post("/api/autocreate", defineToggle("autocreate", {
	table: "guild_active",
	after(event, guild_id) {
		// If showing a partial page due to incomplete setup, need to refresh the whole page to show the alternate version
		const spaceID = select("guild_space", "space_id", {guild_id}).pluck().get()
		if (!spaceID) {
			if (getRequestHeader(event, "HX-Request")) {
				setResponseHeader(event, "HX-Refresh", "true")
			} else {
				return sendRedirect(event, "", 302)
			}
		}
	}
}))

as.router.post("/api/url-preview", defineToggle("url_preview"))

as.router.post("/api/presence", defineToggle("presence", {
	after() {
		setPresence.guildPresenceSetting.update()
	}
}))

as.router.post("/api/privacy-level", defineToggle("privacy_level", {
	transform(value) {
		assert(value)
		const i = ["invite", "link", "directory"].indexOf(value)
		assert.notEqual(i, -1)
		return i
	},
	async after(event, guildID) {
		const createSpace = getCreateSpace(event)
		await createSpace.syncSpaceFully(guildID) // this is inefficient but OK to call infrequently on user request
	}
}))
