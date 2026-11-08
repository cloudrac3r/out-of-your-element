# Self-service room creation rules

Before version 3 of Out Of Your Element, new Matrix rooms would be created on-demand when a Discord channel is spoken in for the first time. This has worked pretty well.

This is done through functions like ensureRoom and ensureSpace in actions:

```js
async function sendMessage(message, channel, guild, row) {
	const roomID = await createRoom.ensureRoom(message.channel_id)
	...
}

/**
 * Ensures the room exists. If it doesn't, creates the room with an accurate initial state.
 * @param {string} channelID
 * @returns {Promise<string>} Matrix room ID
 */
function ensureRoom(channelID) {
	return _syncRoom(channelID, /* shouldActuallySync */ false) /* calls ensureSpace */
}

/**
 * Ensures the space exists. If it doesn't, creates the space with an accurate initial state.
 * @param {DiscordTypes.APIGuild} guild
 * @returns {Promise<string>} Matrix space ID
 */
function ensureSpace(guild) {
	return _syncSpace(guild, /* shouldActuallySync */ false)
}
```

With the introduction of self-service mode, we still want to retain this as a possible mode of operation, since some people prefer to have OOYE handle this administrative work. However, other people prefer to manage the links between channels and rooms themselves, and have control over what new rooms get linked up to.

Visibly, this is managed through the web interface. The web interface lets moderators enable/disable auto-creation of new rooms, as well as set which channels and rooms are linked together.

There is a small complication. Not only are Matrix rooms created automatically, their Matrix spaces are also created automatically during room sync: ensureRoom calls ensureSpace. If a user opts in to self-service mode by clicking the specific button in the web portal, we must ensure the _space is not created automatically either,_ because the Matrix user will provide a space to link to.

To solve this, we need a way to suppress specific guilds from having auto-created spaces. The natural way to represent this is a column on guild_space, but that doesn't work, because each guild_space row requires a guild and space to be linked, and we _don't want_ them to be linked.

So, internally, OOYE keeps track of this through a new table:

```sql
CREATE TABLE "guild_active" (
	"guild_id"	TEXT NOT NULL, -- only guilds that are bridged are present in this table
	"autocreate"	INTEGER NOT NULL, -- 0 or 1
	PRIMARY KEY("guild_id")
) WITHOUT ROWID;
```

There is one more complication. When adding a Discord bot through web oauth with a redirect_uri, Discord adds the bot to the server normally, _then_ redirects back to OOYE, and only then does OOYE know which guild the bot was just added to. So, for a short time between the bot being added and the user being redirected, OOYE might receive Discord events in the server before it has the chance to create the guild_active database row.

So to prevent this, self-service behaviour needs to be an implicit default, and users must firmly choose one system or another to begin using OOYE. It is important for me to design this in a way that doesn't force users to do any extra work or make a choice they don't understand to keep the pre-v3 behaviour.

So there will be 3 states of whether a guild is self-service or not. At first, it could be absent from the table, in which case events for it will be dropped. Or it could be in the table with autocomplete = 0, in which case only rooms that already exist in channel_room will have messages bridged. Or it could have autocomplete = 1, in which case Matrix rooms will be created as needed, as per the pre-v3 behaviour.

| Auto-create | Meaning                  |
| --          | ------------             |
| 😶‍🌫️         | Unbridged - waiting      |
| ❌         | Bridged - self-service   |
| ✅         | Bridged - auto-create    |

Pressing buttons on web or using the /invite command on a guild will insert a row into guild_active, allowing it to be bridged.

So here's all the technical changes needed to support self-service in v3:

- New guild_active table showing whether, and how, a guild is bridged.
- When /invite command is used, INSERT OR IGNORE INTO state 1 and ensureRoom + ensureSpace.
- When bot is added through "easy mode" web button, REPLACE INTO state 1 and ensureSpace.
- When bot is added through "self-service" web button, REPLACE INTO state 0.
- Event dispatcher will only ensureRoom if the guild_active state is 1.
- createRoom will only create other dependencies if the guild is autocreate.

## Enough with your theory. How do rooms actually get bridged now?

After clicking the easy mode button on web and adding the bot to a server, it will create new Matrix rooms on-demand when any invite features are used (web or command) OR just when any message is sent on Discord.

Alternatively, pressing the self-service mode button and adding the bot to a server will prompt the web user to link it with a space. After doing so, they'll be on the standard guild management page where they can invite to the space and manually link rooms. Nothing will be autocreated.
