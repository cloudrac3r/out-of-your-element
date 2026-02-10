// @ts-check

const {reg, writeRegistration, registrationFilePath} = require("../src/matrix/read-registration")
const {prompt} = require("enquirer")

;(async () => {
	/** @type {{web_password: string}} */
	const passwordResponse = await prompt({
		type: "text",
		name: "web_password",
		message: "Choose a simple password (optional)"
	})

	reg.ooye.web_password = passwordResponse.web_password
	writeRegistration(reg)
	console.log("Saved. Restart Out Of Your Element to apply this change.")
})()
