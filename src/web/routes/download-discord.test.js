// @ts-check

const tryToCatch = require("try-to-catch")
const {test} = require("supertape")
const {router} = require("../../../test/web")
const {MatrixServerError} = require("../../matrix/mreq")

const snow = {
	channel: {
		async refreshAttachmentURLs(attachments) {
			if (typeof attachments === "string") attachments = [attachments]
			return {
				refreshed_urls: attachments.map(a => ({
					original: a,
					refreshed: a + `?ex=${Math.floor(Date.now() / 1000 + 3600).toString(16)}`
				}))
			}
		}
	}
}

test("web download discord: access denied if not a known attachment", async t => {
	const [error] = await tryToCatch(() =>
		router.test("get", "/download/discordcdn/:channel_id/:attachment_id/:file_name", {
			params: {
				channel_id: "1",
				attachment_id: "2",
				file_name: "image.png"
			},
			snow
		})
	)
	t.ok(error)
})

test("web download discord: works if a known attachment", async t => {
	const event = {}
	await router.test("get", "/download/discordcdn/:channel_id/:attachment_id/:file_name", {
		params: {
			channel_id: "655216173696286746",
			attachment_id: "1314358913482621010",
			file_name: "image.png"
		},
		event,
		snow
	})
	t.equal(event.node.res.statusCode, 302)
	t.match(event.node.res.getHeader("location"), /https:\/\/cdn.discordapp.com\/attachments\/655216173696286746\/1314358913482621010\/image\.png\?ex=/)
})
