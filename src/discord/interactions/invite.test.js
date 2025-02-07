const {test} = require("supertape")
const DiscordTypes = require("discord-api-types/v10")
const {db, discord} = require("../../passthrough")
const {MatrixServerError} = require("../../matrix/mreq")
const {_interact, _interactButton} = require("./invite")

/**
 * @template T
 * @param {AsyncIterable<T>} ai
 * @returns {Promise<T[]>}
 */
async function fromAsync(ai) {
	const result = []
	for await (const value of ai) {
		result.push(value)
	}
	return result
}

test("invite: checks for missing matrix ID", async t => {
	const msgs = await fromAsync(_interact({
		data: {
			options: []
		},
		channel: discord.channels.get("0"),
		guild_id: "112760669178241024"
	}, {}))
	t.equal(msgs[0].createInteractionResponse.data.content, "You have to say the Matrix ID of the person you want to invite. Matrix IDs look like this: `@username:example.org`")
})

test("invite: checks for invalid matrix ID", async t => {
	const msgs = await fromAsync(_interact({
		data: {
			options: [{
				name: "user",
				type: DiscordTypes.ApplicationCommandOptionType.String,
				value: "@cadence"
			}]
		},
		channel: discord.channels.get("0"),
		guild_id: "112760669178241024"
	}, {}))
	t.equal(msgs[0].createInteractionResponse.data.content, "You have to say the Matrix ID of the person you want to invite. Matrix IDs look like this: `@username:example.org`")
})

test("invite: checks if guild exists", async t => { // it might not exist if the application was added with applications.commands scope and not bot scope
	const msgs = await fromAsync(_interact({
		data: {
			options: [{
				name: "user",
				type: DiscordTypes.ApplicationCommandOptionType.String,
				value: "@cadence:cadence.moe"
			}]
		},
		channel: discord.channels.get("0"),
		guild_id: "0"
	}, {}))
	t.match(msgs[0].createInteractionResponse.data.content, /there is no bot presence in the server/)
})

test("invite: checks if channel exists or is autocreatable", async t => {
	db.prepare("UPDATE guild_active SET autocreate = 0 WHERE guild_id = '112760669178241024'").run()
	const msgs = await fromAsync(_interact({
		data: {
			options: [{
				name: "user",
				type: DiscordTypes.ApplicationCommandOptionType.String,
				value: "@cadence:cadence.moe"
			}]
		},
		channel: discord.channels.get("498323546729086986"),
		guild_id: "112760669178241024"
	}, {}))
	t.equal(msgs[0].createInteractionResponse.data.content, "This channel isn't bridged, so you can't invite Matrix users yet. Try turning on automatic room-creation or link a Matrix room in the website.")
	db.prepare("UPDATE guild_active SET autocreate = 1 WHERE guild_id = '112760669178241024'").run()
})

test("invite: checks if user is already invited to space", async t => {
	let called = 0
	const msgs = await fromAsync(_interact({
		data: {
			options: [{
				name: "user",
				type: DiscordTypes.ApplicationCommandOptionType.String,
				value: "@cadence:cadence.moe"
			}]
		},
		channel: discord.channels.get("112760669178241024"),
		guild_id: "112760669178241024"
	}, {
		api: {
			getStateEvent: async (roomID, type, stateKey) => {
				called++
				t.equal(roomID, "!jjmvBegULiLucuWEHU:cadence.moe") // space ID
				t.equal(type, "m.room.member")
				t.equal(stateKey, "@cadence:cadence.moe")
				return {
					displayname: "cadence",
					membership: "invite"
				}
			}
		}
	}))
	t.equal(msgs[1].editOriginalInteractionResponse.content, "`@cadence:cadence.moe` already has an invite, which they haven't accepted yet.")
	t.equal(called, 1)
})

test("invite: invites if user is not in space", async t => {
	let called = 0
	const msgs = await fromAsync(_interact({
		data: {
			options: [{
				name: "user",
				type: DiscordTypes.ApplicationCommandOptionType.String,
				value: "@cadence:cadence.moe"
			}]
		},
		channel: discord.channels.get("112760669178241024"),
		guild_id: "112760669178241024"
	}, {
		api: {
			getStateEvent: async (roomID, type, stateKey) => {
				called++
				t.equal(roomID, "!jjmvBegULiLucuWEHU:cadence.moe") // space ID
				t.equal(type, "m.room.member")
				t.equal(stateKey, "@cadence:cadence.moe")
				throw new MatrixServerError("State event doesn't exist or something")
			},
			inviteToRoom: async (roomID, mxid) => {
				called++
				t.equal(roomID, "!jjmvBegULiLucuWEHU:cadence.moe") // space ID
				t.equal(mxid, "@cadence:cadence.moe")
			}
		}
	}))
	t.equal(msgs[1].editOriginalInteractionResponse.content, "You invited `@cadence:cadence.moe` to the server.")
	t.equal(called, 2)
})

test("invite: prompts to invite to room (if never joined)", async t => {
	let called = 0
	const msgs = await fromAsync(_interact({
		data: {
			options: [{
				name: "user",
				type: DiscordTypes.ApplicationCommandOptionType.String,
				value: "@cadence:cadence.moe"
			}]
		},
		channel: discord.channels.get("112760669178241024"),
		guild_id: "112760669178241024"
	}, {
		api: {
			getStateEvent: async (roomID, type, stateKey) => {
				called++
				t.equal(type, "m.room.member")
				t.equal(stateKey, "@cadence:cadence.moe")
				if (roomID === "!jjmvBegULiLucuWEHU:cadence.moe") { // space ID
					return {
						displayname: "cadence",
						membership: "join"
					}
				} else {
					throw new MatrixServerError("State event doesn't exist or something")
				}
			}
		}
	}))
	t.equal(msgs[1].editOriginalInteractionResponse.content, "`@cadence:cadence.moe` is already in this server. Would you like to additionally invite them to this specific channel?")
	t.equal(called, 2)
})

test("invite: prompts to invite to room (if left)", async t => {
	let called = 0
	const msgs = await fromAsync(_interact({
		data: {
			options: [{
				name: "user",
				type: DiscordTypes.ApplicationCommandOptionType.String,
				value: "@cadence:cadence.moe"
			}]
		},
		channel: discord.channels.get("112760669178241024"),
		guild_id: "112760669178241024"
	}, {
		api: {
			getStateEvent: async (roomID, type, stateKey) => {
				called++
				t.equal(type, "m.room.member")
				t.equal(stateKey, "@cadence:cadence.moe")
				if (roomID === "!jjmvBegULiLucuWEHU:cadence.moe") { // space ID
					return {
						displayname: "cadence",
						membership: "join"
					}
				} else {
					return {
						displayname: "cadence",
						membership: "leave"
					}
				}
			}
		}
	}))
	t.equal(msgs[1].editOriginalInteractionResponse.content, "`@cadence:cadence.moe` is already in this server. Would you like to additionally invite them to this specific channel?")
	t.equal(called, 2)
})

test("invite button: invites to room when button clicked", async t => {
	let called = 0
	const msg = await _interactButton({
		channel: discord.channels.get("112760669178241024"),
		message: {
			content: "`@cadence:cadence.moe` is already in this server. Would you like to additionally invite them to this specific channel?"
		}
	}, {
		api: {
			inviteToRoom: async (roomID, mxid) => {
				called++
				t.equal(roomID, "!kLRqKKUQXcibIMtOpl:cadence.moe") // room ID
				t.equal(mxid, "@cadence:cadence.moe")
			}
		}
	})
	t.equal(msg.data.content, "You invited `@cadence:cadence.moe` to the channel.")
	t.equal(called, 1)
})

test("invite: no-op if in room and space", async t => {
	let called = 0
	const msgs = await fromAsync(_interact({
		data: {
			options: [{
				name: "user",
				type: DiscordTypes.ApplicationCommandOptionType.String,
				value: "@cadence:cadence.moe"
			}]
		},
		channel: discord.channels.get("112760669178241024"),
		guild_id: "112760669178241024"
	}, {
		api: {
			getStateEvent: async (roomID, type, stateKey) => {
				called++
				t.equal(type, "m.room.member")
				t.equal(stateKey, "@cadence:cadence.moe")
				return {
					displayname: "cadence",
					membership: "join"
				}
			}
		}
	}))
	t.equal(msgs[1].editOriginalInteractionResponse.content, "`@cadence:cadence.moe` is already in this server and this channel.")
	t.equal(called, 2)
})
