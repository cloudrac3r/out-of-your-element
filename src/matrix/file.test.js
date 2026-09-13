// @ts-check

const {test} = require("supertape")
const file = require("./file")

test("removeExpiryParams: url without params is unchanged", t => {
	const url = "https://cdn.discordapp.com/attachments/1154455830591176734/1157034603496882267/59ce542f-bf66-4d9a-83b7-ad6d05a69bac.jpg"
	const result = file._removeExpiryParams(url)
	t.equal(result, url)
})

test("removeExpiryParams: params are removed", t => {
	const url = "https://cdn.discordapp.com/attachments/112760669178241024/1157363960518029322/image.png?ex=651856ae&is=6517052e&hm=88353defb15cbd833e6977817e8f72f4ff28f4edfd26b8ad5f267a4f2b946e69&"
	const result = file._removeExpiryParams(url)
	t.equal(result, "https://cdn.discordapp.com/attachments/112760669178241024/1157363960518029322/image.png")
})

test("removeExpiryParams: rearranged params are removed", t => {
	const url = "https://cdn.discordapp.com/attachments/112760669178241024/1157363960518029322/image.png?hm=88353defb15cbd833e6977817e8f72f4ff28f4edfd26b8ad5f267a4f2b946e69&ex=651856ae&is=6517052e"
	const result = file._removeExpiryParams(url)
	t.equal(result, "https://cdn.discordapp.com/attachments/112760669178241024/1157363960518029322/image.png")
})

test("removeExpiryParams: works on media proxy and keeps quality", t => {
	const url = "https://media.discordapp.net/attachments/1160894080998461480/1548665030898094240/855064e9-bdae-487a-a497-c662bd510487.png?ex=6aa7e234&is=6aa690b4&hm=7c153efcdd1feb1d36d0bb99955a2bfe12f26abea377fed02980521766f51620&format=jpeg"
	const result = file._removeExpiryParams(url)
	t.equal(result, "https://media.discordapp.net/attachments/1160894080998461480/1548665030898094240/855064e9-bdae-487a-a497-c662bd510487.png?format=jpeg")
})
