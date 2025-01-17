// @ts-check

const {test} = require("supertape")
const {encodeEmoji} = require("./emoji")

test("emoji: valid", async t => {
	t.equal(await encodeEmoji("🦄", null), "%F0%9F%A6%84")
})

test("emoji: freeform text", async t => {
	t.equal(await encodeEmoji("ha", null), null)
})

test("emoji: suspicious unicode", async t => {
	t.equal(await encodeEmoji("Ⓐ", null), null)
})

test("emoji: needs u+fe0f added", async t => {
	t.equal(await encodeEmoji("☺", null), "%E2%98%BA%EF%B8%8F")
})

test("emoji: needs u+fe0f removed", async t => {
	t.equal(await encodeEmoji("⭐️", null), "%E2%AD%90")
})

test("emoji: number key needs u+fe0f in the middle", async t => {
	t.equal(await encodeEmoji("3⃣", null), "3%EF%B8%8F%E2%83%A3")
})

test("emoji: hash key needs u+fe0f in the middle", async t => {
	t.equal(await encodeEmoji("#⃣", null), "%23%EF%B8%8F%E2%83%A3")
})

test("emoji: broken chains needs u+fe0f in the middle", async t => {
	t.equal(await encodeEmoji("⛓‍💥", null), "%E2%9B%93%EF%B8%8F%E2%80%8D%F0%9F%92%A5")
})

test("emoji: balling needs u+fe0f in the middle", async t => {
	t.equal(await encodeEmoji("⛹‍♀", null), "%E2%9B%B9%EF%B8%8F%E2%80%8D%E2%99%80%EF%B8%8F")
})

test("emoji: trans flag needs u+fe0f in the middle", async t => {
	t.equal(await encodeEmoji("🏳‍⚧", null), "%F0%9F%8F%B3%EF%B8%8F%E2%80%8D%E2%9A%A7%EF%B8%8F")
})

test("emoji: spy needs u+fe0f in the middle", async t => {
	t.equal(await encodeEmoji("🕵‍♀", null), "%F0%9F%95%B5%EF%B8%8F%E2%80%8D%E2%99%80%EF%B8%8F")
})

test("emoji: couple needs u+fe0f in the middle", async t => {
	t.equal(await encodeEmoji("👩‍❤‍👩", null), "%F0%9F%91%A9%E2%80%8D%E2%9D%A4%EF%B8%8F%E2%80%8D%F0%9F%91%A9")
})
