// @ts-check

const assert = require("assert").strict
const {sync, as} = require("../passthrough")

// Grab Matrix events we care about for the bridge, check them, and pass them on

sync.addTemporaryListener(as, "type:m.room.message", event => {
	console.log(event)
	// TODO: filter out events that were bridged discord messages (i.e. sent by OOYE)
	// TODO: call sendMessage
})
