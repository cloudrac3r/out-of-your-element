// @ts-check

const {addbot} = require("../addbot")
const {test} = require("supertape")

test("addbot: returns message and invite link", t => {
	t.equal(addbot(), `Open this link to add the bot to a Discord server:\nhttps://discord.com/oauth2/authorize?client_id=684280192553844747&scope=bot&permissions=2251801424568320 `)
})
