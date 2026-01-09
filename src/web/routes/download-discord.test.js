// @ts-check

const assert = require("assert").strict
const tryToCatch = require("try-to-catch")
const {test} = require("supertape")
const {router} = require("../../../test/web")
const {_cache} = require("./download-discord")

test("web download discord: access denied if not a known attachment", async t => {
	const [error] = await tryToCatch(() =>
		router.test("get", "/download/discordcdn/:channel_id/:attachment_id/:file_name", {
			params: {
				channel_id: "1",
				attachment_id: "2",
				file_name: "image.png"
			}
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
		snow: {
			channel: {
				async refreshAttachmentURLs(attachments) {
					assert(Array.isArray(attachments))
					return {
						refreshed_urls: attachments.map(a => ({
							original: a,
							refreshed: a + `?ex=${Math.floor(Date.now() / 1000 + 3600).toString(16)}`
						}))
					}
				}
			}
		}
	})
	t.equal(event.node.res.statusCode, 302)
	t.match(event.node.res.getHeader("location"), /https:\/\/cdn.discordapp.com\/attachments\/655216173696286746\/1314358913482621010\/image\.png\?ex=/)
})

test("web download discord: uses cache", async t => {
	let notCalled = true
	const event = {}
	await router.test("get", "/download/discordcdn/:channel_id/:attachment_id/:file_name", {
		params: {
			channel_id: "655216173696286746",
			attachment_id: "1314358913482621010",
			file_name: "image.png"
		},
		event,
		snow: {
			channel: {
				/* c8 ignore next 4 */
				async refreshAttachmentURLs(attachments) {
					notCalled = false
					throw new Error("tried to refresh when it should be in cache")
				}
			}
		}
	})
	t.ok(notCalled)
})

test("web download discord: refreshes when cache has expired", async t => {
	_cache.set(`https://cdn.discordapp.com/attachments/655216173696286746/1314358913482621010/image.png`, Promise.resolve(`https://cdn.discordapp.com/blah?ex=${Math.floor(new Date("2026-01-01").getTime() / 1000 + 3600).toString(16)}`))
	let called = 0
	await router.test("get", "/download/discordcdn/:channel_id/:attachment_id/:file_name", {
		params: {
			channel_id: "655216173696286746",
			attachment_id: "1314358913482621010",
			file_name: "image.png"
		},
		snow: {
			channel: {
				async refreshAttachmentURLs(attachments) {
					called++
					assert(Array.isArray(attachments))
					return {
						refreshed_urls: attachments.map(a => ({
							original: a,
							refreshed: a + `?ex=${Math.floor(Date.now() / 1000 + 3600).toString(16)}`
						}))
					}
				}
			}
		}
	})
	t.equal(called, 1)
})
