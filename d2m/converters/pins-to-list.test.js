const {test} = require("supertape")
const data = require("../../test/data")
const {pinsToList} = require("./pins-to-list")

test("pins2list: converts known IDs, ignores unknown IDs", t => {
	const result = pinsToList(data.pins.faked)
	t.deepEqual(result, [
		"$X16nfVks1wsrhq4E9SSLiqrf2N8KD0erD0scZG7U5xg",
		"$mtR8cJqM4fKno1bVsm8F4wUVqSntt2sq6jav1lyavuA",
		"$lnAF9IosAECTnlv9p2e18FG8rHn-JgYKHEHIh5qdFv4"
	])
})
