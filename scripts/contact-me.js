// @ts-check

const {reg, writeRegistration} = require("../src/matrix/read-registration")
const {prompt} = require("enquirer")
const {cyan} = require("ansi-colors")

;(async () => {
	console.log("Discord users need to be able to contact you to request manual removal of their data from Matrix.")
	console.log("Please provide your actual contact details. Your response will be included as HTML in the privacy policy web page.")
	console.log("Sample responses:")
	console.log(cyan("  @myname on Discord"))
	console.log(cyan("  myname@gmail.com"))
	console.log(cyan("  <a href=https://example.org/contact>My Name</a>"))
	/** @type {{bridge_admin_contact: string}} */
	const contactResponse = await prompt({
		type: "text",
		name: "bridge_admin_contact",
		message: "How to contact you"
	})

	reg.ooye.bridge_admin_contact = contactResponse.bridge_admin_contact
	writeRegistration(reg)
	console.log("Saved. This change should be applied instantly.")
})()
