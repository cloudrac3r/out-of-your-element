// @ts-check

const tryToCatch = require("try-to-catch")
const {test} = require("supertape")
const {reg, checkRegistration, getTemplateRegistration} = require("./read-registration")

test("reg: has necessary parameters", t => {
	const propertiesToCheck = ["sender_localpart", "id", "as_token", "ooye"]
	t.deepEqual(
		propertiesToCheck.filter(p => p in reg),
		propertiesToCheck
	)
})

test("check: passes on sample", t => {
	checkRegistration(reg)
	t.pass("all assertions passed")
})

test("check: fails on template as template is missing some required values that are gathered during setup", t => {
	let err
	try {
		// @ts-ignore
		checkRegistration(getTemplateRegistration("cadence.moe"))
	} catch (e) {
		err = e
	}
	t.ok(err, "one of the assertions failed as expected")
})
