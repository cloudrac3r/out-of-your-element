const {test} = require("supertape")
const tryToCatch = require("try-to-catch")
const assert = require("assert")
const data = require("../../../test/data")
const {userToSimName} = require("./user-to-mxid")

test("user2name: cannot create user for a webhook", async t => {
   const [error] = await tryToCatch(() => userToSimName({discriminator: "0000"}))
   t.ok(error instanceof assert.AssertionError, error.message)
})

test("user2name: works on normal name", t => {
   t.equal(userToSimName({username: "Harry Styles!", discriminator: "0001"}), "harry_styles")
})

test("user2name: works on emojis", t => {
   t.equal(userToSimName({username: "🍪 Cookie Monster 🍪", discriminator: "0001"}), "cookie_monster")
})

test("user2name: works on single emoji at the end", t => {
   t.equal(userToSimName({username: "Melody 🎵", discriminator: "2192"}), "melody")
})

test("user2name: works on crazy name", t => {
   t.equal(userToSimName({username: "*** D3 &W (89) _7//-", discriminator: "0001"}), "d3_w_89__7//")
})

test("user2name: adds discriminator if name is unavailable (old tag format)", t => {
   t.equal(userToSimName({username: "BOT$", discriminator: "1234"}), "bot1234")
})

test("user2name: adds number suffix if name is unavailable (new username format)", t => {
   t.equal(userToSimName({username: "bot", discriminator: "0"}), "bot2")
})

test("user2name: uses ID if name becomes too short", t => {
   t.equal(userToSimName({username: "f***", discriminator: "0001", id: "9"}), "9")
})

test("user2name: uses ID when name has only disallowed characters", t => {
   t.equal(userToSimName({username: "!@#$%^&*", discriminator: "0001", id: "9"}), "9")
})

test("user2name: works on special user", t => {
	t.equal(userToSimName(data.user.clyde_ai), "clyde_ai")
})

test("user2name: includes ID if requested in config", t => {
	const {reg} = require("../../matrix/read-registration")
	reg.ooye.include_user_id_in_mxid = true
	t.equal(userToSimName({username: "Harry Styles!", discriminator: "0001", id: "123456"}), "123456_harry_styles")
   t.equal(userToSimName({username: "f***", discriminator: "0001", id: "123456"}), "123456_f")
	reg.ooye.include_user_id_in_mxid = false
})
