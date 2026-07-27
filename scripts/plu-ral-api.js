// @ts-check

const {reg, writeRegistration} = require("../src/matrix/read-registration")
const {prompt} = require("enquirer")

;(async () => {
	/** @type {{api_key: string}} */
	const apiKeyResponse = await prompt({
		type: "text",
		name: "api_key",
		message: "Paste your personal /plu/ral API key"
	})

	reg.ooye.plu_ral_api_key = apiKeyResponse.api_key
	writeRegistration(reg)
	console.log("Saved. This change should be applied instantly.")
})()
