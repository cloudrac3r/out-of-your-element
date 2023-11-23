// @ts-check

const {db} = require("../passthrough")
const U = require("./orm-defs")

/**
 * @template {keyof U.Models} Table
 * @template {keyof U.Models[Table]} Col
 * @param {Table} table
 * @param {Col[] | Col} cols
 * @param {Partial<U.Models[Table]>} where
 * @param {string} [e]
 */
function select(table, cols, where = {}, e = "") {
	if (!Array.isArray(cols)) cols = [cols]
	const parameters = []
	const wheres = Object.entries(where).map(([col, value]) => {
		parameters.push(value)
		return `"${col}" = ?`
	})
	const whereString = wheres.length ? " WHERE " + wheres.join(" AND ") : ""
	/** @type {U.Prepared<Pick<U.Models[Table], Col>>} */
	const prepared = db.prepare(`SELECT ${cols.map(k => `"${String(k)}"`).join(", ")} FROM ${table} ${whereString} ${e}`)
	prepared.get = prepared.get.bind(prepared, ...parameters)
	prepared.all = prepared.all.bind(prepared, ...parameters)
	return prepared
}

/**
 * @template {keyof U.Models} Table
 * @template {keyof U.Merge<U.Models[Table]>} Col
 */
class From {
	/**
	 * @param {Table} table
	 */
	constructor(table) {
		/** @private @type {Table[]} */
		this.tables = [table]
		/** @private */
		this.sql = ""
		/** @private */
		this.cols = []
		/** @private */
		this.using = []
		/** @private */
		this.isPluck = false
		/** @private */
		this.parameters = []
	}

	/**
	 * @template {keyof U.Models} Table2
	 * @param {Table2} table
	 * @param {Col & (keyof U.Models[Table2])} col
	 */
	join(table, col) {
		/** @type {From<Table | Table2, keyof U.Merge<U.Models[Table | Table2]>>} */
		// @ts-ignore
		const r = this
		r.tables.push(table)
		r.using.push(col)
		return r
	}

	/**
	 * @template {Col} Select
	 * @param {Col[] | Select[]} cols
	 */
	select(...cols) {
		/** @type {From<Table, Select>} */
		const r = this
		r.cols = cols
		return r
	}

	/**
	 * @template {Col} Select
	 * @param {Select} col
	 */
	pluck(col) {
		/** @type {Pluck<Table, Select>} */
		// @ts-ignore
		const r = this
		r.cols = [col]
		r.isPluck = true
		return r
	}

	/**
	 * @param {string} sql
	 */
	and(sql) {
		this.sql += " " + sql
		return this
	}

	/**
	 * @param {Partial<U.Models[Table]>} conditions
	 */
	where(conditions) {
		const wheres = Object.entries(conditions).map(([col, value]) => {
			this.parameters.push(value)
			return `"${col}" = ?`
		})
		this.sql += " WHERE " + wheres.join(" AND ")
		return this
	}

	prepare() {
		let sql = `SELECT ${this.cols.map(k => `"${k}"`).join(", ")} FROM ${this.tables[0]} `
		for (let i = 1; i < this.tables.length; i++) {
			const table = this.tables[i]
			const col = this.using[i-1]
			sql += `INNER JOIN ${table} USING (${col}) `
		}
		sql += this.sql
		/** @type {U.Prepared<Pick<U.Merge<U.Models[Table]>, Col>>} */
		let prepared = db.prepare(sql)
		if (this.isPluck) prepared = prepared.pluck()
		return prepared
	}

	get(..._) {
		const prepared = this.prepare()
		return prepared.get(...this.parameters, ..._)
	}

	all(..._) {
		const prepared = this.prepare()
		return prepared.all(...this.parameters, ..._)
	}
}

/* c8 ignore start - this code is only used for types and does not actually execute */
/**
 * @template {keyof U.Models} Table
 * @template {keyof U.Merge<U.Models[Table]>} Col
 */
class Pluck extends From {
	// @ts-ignore
	prepare() {
		/** @type {U.Prepared<U.Merge<U.Models[Table]>[Col]>} */
		// @ts-ignore
		const prepared = super.prepare()
		return prepared
	}

	get(..._) {
		const prepared = this.prepare()
		return prepared.get(..._)
	}

	all(..._) {
		const prepared = this.prepare()
		return prepared.all(..._)
	}
}
/* c8 ignore stop */

/**
 * @template {keyof U.Models} Table
 * @param {Table} table
 */
function from(table) {
	return new From(table)
}

module.exports.from = from
module.exports.select = select
