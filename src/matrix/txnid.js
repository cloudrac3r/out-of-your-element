// @ts-check

const {sync} = require("../passthrough")

const state = sync.remember(() => ({now: Date.now()}))

module.exports.makeTxnId = function makeTxnId() {
	return state.now++
}
