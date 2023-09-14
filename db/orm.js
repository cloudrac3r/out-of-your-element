// @ts-check

const {db} = require("../passthrough")
const U = require("./orm-utils")

/**
 * @template {keyof U.Models} Table
 * @template {keyof U.Models[Table]} Col
 * @param {Table} table
 * @param {Col[] | Col} cols
 * @param {string} [e]
 */
function select(table, cols, e = "") {
	if (!Array.isArray(cols)) cols = [cols]
	/** @type {U.Prepared<Pick<U.Models[Table], Col>>} */
	const prepared = db.prepare(`SELECT ${cols.map(k => `"${String(k)}"`).join(", ")} FROM ${table} ${e}`)
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
		/** @type {Table[]} */
		this.tables = [table]

		this.sql = ""
		this.cols = []
		this.using = []
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
		r.constructor = Pluck
		r.cols = [col]
		return r
	}

	/**
	 * @param {string} sql
	 */
	and(sql) {
		this.sql = sql
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
		const prepared = db.prepare(sql)
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

/**
 * @template {keyof U.Models} Table
 * @param {Table} table
 */
function from(table) {
	return new From(table)
}

module.exports.from = from
module.exports.select = select
