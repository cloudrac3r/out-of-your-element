// @ts-check

const {test} = require("supertape")
const removeReaction = require("./remove-reaction")

const BRIDGE_ID = "684280192553844747"

function fakeSpecificReactionRemoval(userID, emoji, emojiID) {
	return {
		channel_id: "THE_CHANNEL",
		message_id: "THE_MESSAGE",
		user_id: userID,
		emoji: {id: emojiID, name: emoji},
		burst: false,
		type: 0
	}
}

function fakeEmojiReactionRemoval(emoji, emojiID) {
	return {
		channel_id: "THE_CHANNEL",
		message_id: "THE_MESSAGE",
		emoji: {id: emojiID, name: emoji}
	}
}

function fakeAllReactionRemoval() {
	return {
		channel_id: "THE_CHANNEL",
		message_id: "THE_MESSAGE"
	}
}

function fakeReactions(reactions) {
	return reactions.map(({sender, key}, i) => ({
		content: {
			"m.relates_to": {
				rel_type: "m.annotation",
				event_id: "$message",
				key
			}
		},
		event_id: `$reaction_${i}`,
		sender,
		type: "m.reaction",
		origin_server_ts: 0,
		room_id: "!THE_ROOM",
		unsigned: null
	}))
}

test("remove reaction: a specific discord user's reaction is removed", t => {
	const removals = removeReaction.removeReaction(
		fakeSpecificReactionRemoval("820865262526005258", "🐈", null),
		fakeReactions([{key: "🐈", sender: "@_ooye_crunch_god:cadence.moe"}]),
		"🐈"
	)
	t.deepEqual(removals, [{
		eventID: "$reaction_0",
		mxid: "@_ooye_crunch_god:cadence.moe"
	}])
})

test("remove reaction: a specific matrix user's reaction is removed", t => {
	const removals = removeReaction.removeReaction(
		fakeSpecificReactionRemoval(BRIDGE_ID, "🐈", null),
		fakeReactions([{key: "🐈", sender: "@cadence:cadence.moe"}]),
		"🐈"
	)
	t.deepEqual(removals, [{
		eventID: "$reaction_0",
		mxid: null,
		hash: 2842343637291700751n
	}])
})

test("remove reaction: a specific discord user's reaction is removed when there are multiple reactions", t => {
	const removals = removeReaction.removeReaction(
		fakeSpecificReactionRemoval("820865262526005258", "🐈", null),
		fakeReactions([
			{key: "🐈‍⬛", sender: "@_ooye_crunch_god:cadence.moe"},
			{key: "🐈", sender: "@_ooye_crunch_god:cadence.moe"},
			{key: "🐈", sender: "@_ooye_extremity:cadence.moe"},
			{key: "🐈", sender: "@cadence:cadence.moe"},
			{key: "🐈", sender: "@zoe:cadence.moe"}
		]),
		"🐈"
	)
	t.deepEqual(removals, [{
		eventID: "$reaction_1",
		mxid: "@_ooye_crunch_god:cadence.moe"
	}])
})

test("remove reaction: a specific reaction leads to all matrix users' reaction of the emoji being removed", t => {
	const removals = removeReaction.removeReaction(
		fakeSpecificReactionRemoval(BRIDGE_ID, "🐈", null),
		fakeReactions([
			{key: "🐈", sender: "@_ooye_crunch_god:cadence.moe"},
			{key: "🐈", sender: "@cadence:cadence.moe"},
			{key: "🐈‍⬛", sender: "@zoe:cadence.moe"},
			{key: "🐈", sender: "@zoe:cadence.moe"},
			{key: "🐈", sender: "@_ooye_extremity:cadence.moe"}
		]),
		"🐈"
	)
	t.deepEqual(removals, [{
		eventID: "$reaction_1",
		mxid: null,
		hash: -8635141960139030904n
	}, {
		eventID: "$reaction_3",
		mxid: null,
		hash: 326222869084879263n
	}])
})

test("remove reaction: an emoji removes all instances of the emoij from both sides", t => {
	const removals = removeReaction.removeEmojiReaction(
		fakeEmojiReactionRemoval("🐈", null),
		fakeReactions([
			{key: "🐈", sender: "@_ooye_crunch_god:cadence.moe"},
			{key: "🐈", sender: "@cadence:cadence.moe"},
			{key: "🐈‍⬛", sender: "@zoe:cadence.moe"},
			{key: "🐈", sender: "@zoe:cadence.moe"},
			{key: "🐈", sender: "@_ooye_extremity:cadence.moe"}
		]),
		"🐈"
	)
	t.deepEqual(removals, [{
		eventID: "$reaction_0",
		mxid: "@_ooye_crunch_god:cadence.moe"
	}, {
		eventID: "$reaction_1",
		mxid: null
	}, {
		eventID: "$reaction_3",
		mxid: null
	}, {
		eventID: "$reaction_4",
		mxid: "@_ooye_extremity:cadence.moe"
	}])
})

test("remove reaction: remove all removes all from both sides", t => {
	const removals = removeReaction.removeAllReactions(
		fakeAllReactionRemoval(),
		fakeReactions([
			{key: "🐈", sender: "@_ooye_crunch_god:cadence.moe"},
			{key: "🐈", sender: "@cadence:cadence.moe"},
			{key: "🐈‍⬛", sender: "@zoe:cadence.moe"},
			{key: "🐈", sender: "@zoe:cadence.moe"},
			{key: "🐈", sender: "@_ooye_extremity:cadence.moe"}
		])
	)
	t.deepEqual(removals, [{
		eventID: "$reaction_0",
		mxid: "@_ooye_crunch_god:cadence.moe"
	}, {
		eventID: "$reaction_1",
		mxid: null
	}, {
		eventID: "$reaction_2",
		mxid: null
	}, {
		eventID: "$reaction_3",
		mxid: null
	}, {
		eventID: "$reaction_4",
		mxid: "@_ooye_extremity:cadence.moe"
	}])
})
