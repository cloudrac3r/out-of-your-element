// @ts-check

const {test} = require("supertape")
const diffPins = require("./diff-pins")

test("diff pins: diff is as expected", t => {
	t.deepEqual(
		diffPins.diffPins(["same", "new"], ["same", "old"]),
		[["old", false], ["new", true]]
	)
})
