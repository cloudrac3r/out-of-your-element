// @ts-check

const {test} = require("supertape")
const txnid = require("./txnid")

test("txnid: generates different values each run", t => {
	const one = txnid.makeTxnId()
	t.ok(one)
	const two = txnid.makeTxnId()
	t.ok(two)
	t.notEqual(two, one)
})
