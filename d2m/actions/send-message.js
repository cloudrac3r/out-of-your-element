// @ts-check

const reg = require("../../matrix/read-registration.js")
const makeTxnId = require("../../matrix/txnid.js")
const fetch = require("node-fetch").default
const messageToEvent = require("../converters/message-to-event.js")

/**
 * @param {import("discord-api-types/v10").GatewayMessageCreateDispatchData} message
 */
function sendMessage(message) {
	const event = messageToEvent.messageToEvent(message)
	return fetch(`https://matrix.cadence.moe/_matrix/client/v3/rooms/!VwVlIAjOjejUpDhlbA:cadence.moe/send/m.room.message/${makeTxnId()}?user_id=@_ooye_example:cadence.moe`, {
		method: "PUT",
		body: JSON.stringify(event),
		headers: {
			Authorization: `Bearer ${reg.as_token}`
		}
	}).then(res => res.text()).then(text => {
		// {"event_id":"$4Zxs0fMmYlbo-sTlMmSEvwIs9b4hcg6yORzK0Ems84Q"}
		console.log(text)
	}).catch(err => {
		console.log(err)
	})
}

module.exports.sendMessage = sendMessage
