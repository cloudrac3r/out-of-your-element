// @ts-check

const {test} = require("supertape")
const {removeMemberMxids} = require("./remove-member-mxids")

test("remove member mxids: would remove mxid for all rooms in this server", t => {
	t.deepEqual(removeMemberMxids("772659086046658620", "112760669178241024"), {
		userAppDeletions: [],
		membership: [{
			mxid: "@_ooye_cadence:cadence.moe",
			room_id: "!fGgIymcYWOqjbSRUdV:cadence.moe"
		}, {
			mxid: "@_ooye_cadence:cadence.moe",
			room_id: "!kLRqKKUQXcibIMtOpl:cadence.moe"
		}]
	})
})

test("remove member mxids: removes sims too", t => {
	t.deepEqual(removeMemberMxids("196188877885538304", "112760669178241024"), {
		userAppDeletions: [],
		membership: [{
			mxid: '@_ooye_ampflower:cadence.moe',
			room_id: '!qzDBLKlildpzrrOnFZ:cadence.moe'
		}, {
			mxid: '@_ooye__pk_zoego:cadence.moe',
			room_id: '!qzDBLKlildpzrrOnFZ:cadence.moe'
		}]
	})
})

test("remove member mxids: removes apps too", t => {
	t.deepEqual(removeMemberMxids("197126718400626689", "66192955777486848"), {
		userAppDeletions: ["197126718400626689"],
		membership: [{
			mxid: '@_ooye_infinidoge1337:cadence.moe',
			room_id: '!BnKuBPCvyfOkhcUjEu:cadence.moe'
		}, {
			mxid: '@_ooye_evil_lillith_sheher:cadence.moe',
			room_id: '!BnKuBPCvyfOkhcUjEu:cadence.moe'
		}]
	})
})
