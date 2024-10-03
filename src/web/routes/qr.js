// @ts-check

const {z} = require("zod")
const {defineEventHandler, getValidatedQuery} = require("h3")

const {as} = require("../../passthrough")

const uqr = require("uqr")

const schema = {
	qr: z.object({
		data: z.string().max(128)
	})
}

as.router.get("/qr", defineEventHandler(async event => {
	const {data} = await getValidatedQuery(event, schema.qr.parse)
	return new Response(uqr.renderSVG(data, {pixelSize: 3}), {headers: {"content-type": "image/svg+xml"}})
}))
