// @ts-check

const {test} = require("supertape")
const {stringifyErrorStack} = require("./errors")

test("stringify error stack: works", t => {
	function a() {
		const e = new Error("message", {cause: new Error("inner")})
		// @ts-ignore
		e.prop = 2.1
		throw e
	}
	try {
		a()
		t.fail("shouldn't get here")
	} catch (e) {
		const str = stringifyErrorStack(e)
		t.match(str, /^Error: message$/m)
		t.match(str, /^    at a \(.*errors\.test\.js/m)
		t.match(str, /^  \[cause\]: Error: inner$/m)
		t.match(str, /^  \[prop\]: 2.1$/m)
	}
})
