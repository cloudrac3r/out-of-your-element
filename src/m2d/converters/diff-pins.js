// @ts-check

/**
 * @param {string[]} pins
 * @param {string[]} prev
 * @returns {[string, boolean][]}
 */
function diffPins(pins, prev) {
	/** @type {[string, boolean][]} */
	const result = []
	return result.concat(
		prev.filter(id => !pins.includes(id)).map(id => [id, false]), // removed
		pins.filter(id => !prev.includes(id)).map(id => [id, true]) // added
	)
}

module.exports.diffPins = diffPins
