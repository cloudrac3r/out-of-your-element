/*
	a. If the bridge bot sim already has the correct ID:
		- No rows updated.

	b. If the bridge bot sim has the wrong ID but there's no duplicate:
		- One row updated.

	c. If the bridge bot sim has the wrong ID and there's a duplicate:
		- One row updated (replaces an existing row).
*/

module.exports = async function(db) {
	const id = require("../../../addbot").id
	db.prepare("UPDATE OR REPLACE sim SET user_id = ? WHERE user_id = '0'").run(id)
}
