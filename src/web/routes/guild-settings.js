// @ts-check

const assert = require("assert/strict")
const {z} = require("zod")
const {defineEventHandler, createError, readValidatedBody, getRequestHeader, setResponseHeader, sendRedirect, H3Event} = require("h3")

const {as, db, sync, select, discord} = require("../../passthrough")

/** @type {import("../auth")} */
const auth = sync.require("../auth")
/** @type {import("../pug-sync")} */
const pugSync = sync.require("../pug-sync")
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

const schema = {
	defaultRoles: z.object({
		guild_id: z.string(),
		toggle_role: z.string().optional(),
		remove_role: z.string().optional()
	})
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

as.router.post("/api/webhook-profile", defineToggle("webhook_profile"))

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

as.router.post("/api/default-roles", defineEventHandler(async event => {
	const parsedBody = await readValidatedBody(event, schema.defaultRoles.parse)

	const managed = await auth.getManagedGuilds(event)
	const guildID = parsedBody.guild_id
	if (!managed.has(guildID)) throw createError({status: 403, message: "Forbidden", data: "Can't change settings for a guild you don't have Manage Server permissions in"})

	const roleID = parsedBody.toggle_role || parsedBody.remove_role
	assert(roleID)
	assert.notEqual(guildID, roleID) // the @everyone role is always default

	const guild = discord.guilds.get(guildID)
	assert(guild)

	let shouldRemove = !!parsedBody.remove_role
	if (!shouldRemove) {
		shouldRemove = !!select("role_default", "role_id", {guild_id: guildID, role_id: roleID}).get()
	}

	if (shouldRemove) {
		db.prepare("DELETE FROM role_default WHERE guild_id = ? AND role_id = ?").run(guildID, roleID)
	} else {
		assert(guild.roles.find(r => r.id === roleID))
		db.prepare("INSERT OR IGNORE INTO role_default (guild_id, role_id) VALUES (?, ?)").run(guildID, roleID)
	}

	const createSpace = getCreateSpace(event)
	await createSpace.syncSpaceFully(guildID) // this is inefficient but OK to call infrequently on user request

	if (getRequestHeader(event, "HX-Request")) {
		return pugSync.render(event, "fragments/default-roles-list.pug", {guild, guild_id: guildID})
	} else {
		return sendRedirect(event, `/guild?guild_id=${guildID}`, 302)
	}
}))
