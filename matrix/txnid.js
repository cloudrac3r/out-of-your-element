// @ts-check

let now = Date.now()

module.exports = function makeTxnId() {
	return now++
}
