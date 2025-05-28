const {test} = require("supertape")
const data = require("../../../test/data")
const {pinsToList} = require("./pins-to-list")

test("pins2list: converts known IDs, ignores unknown IDs", t => {
	const result = pinsToList(data.pins.faked, {})
	t.deepEqual(result, [
		"$lnAF9IosAECTnlv9p2e18FG8rHn-JgYKHEHIh5qdFv4",
		"$mtR8cJqM4fKno1bVsm8F4wUVqSntt2sq6jav1lyavuA",
		"$X16nfVks1wsrhq4E9SSLiqrf2N8KD0erD0scZG7U5xg"
	])
})

test("pins2list: already pinned duplicate items are not moved", t => {
	const result = pinsToList(data.pins.faked, {
		"m.room.pinned_events/": {
			pinned: [
				"$mtR8cJqM4fKno1bVsm8F4wUVqSntt2sq6jav1lyavuA"
			]
		}
	})
	t.deepEqual(result, [
		"$mtR8cJqM4fKno1bVsm8F4wUVqSntt2sq6jav1lyavuA",
		"$lnAF9IosAECTnlv9p2e18FG8rHn-JgYKHEHIh5qdFv4",
		"$X16nfVks1wsrhq4E9SSLiqrf2N8KD0erD0scZG7U5xg"
	])
})

test("pins2list: already pinned unknown items are not moved", t => {
	const result = pinsToList(data.pins.faked, {
		"m.room.pinned_events/": {
			pinned: [
				"$unknown1",
				"$mtR8cJqM4fKno1bVsm8F4wUVqSntt2sq6jav1lyavuA",
				"$unknown2"
			]
		}
	})
	t.deepEqual(result, [
		"$unknown1",
		"$mtR8cJqM4fKno1bVsm8F4wUVqSntt2sq6jav1lyavuA",
		"$unknown2",
		"$lnAF9IosAECTnlv9p2e18FG8rHn-JgYKHEHIh5qdFv4",
		"$X16nfVks1wsrhq4E9SSLiqrf2N8KD0erD0scZG7U5xg"
	])
})

test("pins2list: bridged messages can be unpinned", t => {
	const result = pinsToList(data.pins.faked.slice(0, -2), {
		"m.room.pinned_events/": {
			pinned: [
				"$mtR8cJqM4fKno1bVsm8F4wUVqSntt2sq6jav1lyavuA",
				"$lnAF9IosAECTnlv9p2e18FG8rHn-JgYKHEHIh5qdFv4"
			]
		}
	})
	t.deepEqual(result, [
		"$mtR8cJqM4fKno1bVsm8F4wUVqSntt2sq6jav1lyavuA",
		"$X16nfVks1wsrhq4E9SSLiqrf2N8KD0erD0scZG7U5xg",
	])
})
