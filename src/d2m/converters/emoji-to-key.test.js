// @ts-check

const {test} = require("supertape")
const {emojiToKey} = require("./emoji-to-key")
const data = require("../../../test/data")
const Ty = require("../../types")

test("emoji2key: unicode emoji works", async t => {
	const result = await emojiToKey({id: null, name: "🐈"})
	t.equal(result, "🐈")
})

test("emoji2key: custom emoji works", async t => {
	const result = await emojiToKey({id: "230201364309868544", name: "hippo", animated: false})
	t.equal(result, "mxc://cadence.moe/qWmbXeRspZRLPcjseyLmeyXC")
})

test("emoji2key: custom animated emoji works", async t => {
	const result = await emojiToKey({id: "393635038903926784", name: "hipposcope", animated: true})
	t.equal(result, "mxc://cadence.moe/WbYqNlACRuicynBfdnPYtmvc")
})
