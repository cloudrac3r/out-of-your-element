// @ts-check

let now = Date.now()

module.exports.makeTxnId = function makeTxnId() {
	return now++
}
