// @ts-check

const reg = require("../../matrix/read-registration.js")
const fetch = require("node-fetch")

fetch("https://matrix.cadence.moe/_matrix/client/v3/register", {
	method: "POST",
	body: JSON.stringify({
		type: "m.login.application_service",
		username: "_ooye_example"
	}),
	headers: {
		Authorization: `Bearer ${reg.as_token}`
	}
}).then(res => res.text()).then(text => {
	// {"user_id":"@_ooye_example:cadence.moe","home_server":"cadence.moe","access_token":"XXX","device_id":"XXX"}
	console.log(text)
}).catch(err => {
	console.log(err)
})
