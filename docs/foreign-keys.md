# Foreign keys in the Out Of Your Element database

Historically, Out Of Your Element did not use foreign keys in the database, but since I found a need for them, I have decided to add them. Referential integrity is probably valuable as well.

The need is that unlinking a channel and room using the web interface should clear up all related entries from `message_channel`, `event_message`, `reaction`, etc. Without foreign keys, this requires multiple DELETEs with tricky queries. With foreign keys and ON DELETE CASCADE, this just works.

## Quirks

* **REPLACE INTO** internally causes a DELETE followed by an INSERT, and the DELETE part **will trigger any ON DELETE CASCADE** foreign key conditions on the table, even when the primary key being replaced is the same.
	* ```sql
		CREATE TABLE discord_channel (channel_id TEXT NOT NULL, name TEXT NOT NULL, PRIMARY KEY (channel_id));
		CREATE TABLE discord_message (message_id TEXT NOT NULL, channel_id TEXT NOT NULL, PRIMARY KEY (message_id),
		  FOREIGN KEY (channel_id) REFERENCES discord_channel (channel_id) ON DELETE CASCADE);
		INSERT INTO discord_channel (channel_id, name) VALUES ("c_1", "place");
		INSERT INTO discord_message (message_id, channel_id) VALUES ("m_2", "c_1"); -- i love my message
		REPLACE INTO discord_channel (channel_id, name) VALUES ("c_1", "new place"); -- replace into time
		-- i love my message
		SELECT * FROM discord_message; -- where is my message
		```
* In SQLite, `pragma foreign_keys = on` must be set **for each connection** after it's established. I've added this at the start of `migrate.js`, which is called by all database connections.
  * Pragma? Pragma keys
* Whenever a child row is inserted, SQLite will look up a row from the parent table to ensure referential integrity. This means **the parent table should be sufficiently keyed or indexed on columns referenced by foreign keys**, or SQLite won't let you do it, with a cryptic error message later on during DML. Due to normal forms, foreign keys naturally tend to reference the parent table's primary key, which is indexed, so that's okay. But still keep this in mind, since many of OOYE's tables effectively have two primary keys, for the Discord and Matrix IDs. A composite primary key doesn't count, even when it's the first column. A unique index counts.

## Where keys

Here are some tables that could potentially have foreign keys added between them, and my thought process of whether foreign keys would be a good idea:

* `guild_active` <--(PK guild_id FK)-- `channel_room` ✅
	* Could be good for referential integrity.
	* Linking to guild_space would be pretty scary in case the guild was being relinked to a different space - since rooms aren't tied to a space, this wouldn't actually disturb anything. So I pick guild_active instead.
* `channel_room` <--(PK channel_id FK)-- `message_channel` ✅
	* Seems useful as we want message records to be deleted when a channel is unlinked.
* `message_channel` <--(PK message_id PK)-- `event_message` ✅
	* Seems useful as we want event information to be deleted when a channel is unlinked.
* `guild_active` <--(PK guild_id PK)-- `guild_space` ✅
	* All bridged guilds should have a corresponding guild_active entry, so referential integrity would be useful here to make sure we haven't got any weird states.
* `channel_room` <--(**C** room_id PK)-- `member_cache` ✅
	* Seems useful as we want to clear the member cache when a channel is unlinked.
	* There is no index on `channel_room.room_id` right now. It would be good to create this index. Will just make it UNIQUE in the table definition.
* `message_channel` <--(PK message_id FK)-- `reaction` ✅
	* Seems useful as we want to clear the reactions cache when a channel is unlinked.
* `sim` <--(**C** mxid FK)-- `sim_member`
	* OOYE inner joins on this.
	* Sims are never deleted so if this was added it would only be used for enforcing referential integrity.
	* The storage cost of the additional index on `sim` would not be worth the benefits.
* `channel_room` <--(**C** room_id PK)-- `sim_member`
	* If a room is being permanently unlinked, it may be useful to see a populated member list. If it's about to be relinked to another channel, we want to keep the sims in the room for more speed and to avoid spamming state events into the timeline.
	* Either way, the sims could remain in the room even after it's been unlinked. So no referential integrity is desirable here.
* `sim` <--(PK user_id PK)-- `sim_proxy`
	* OOYE left joins on this. In normal operation, this relationship might not exist.
* `channel_room` <--(PK channel_id PK)-- `webhook` ✅
	* Seems useful. Webhooks should be deleted from Discord just before the channel is unlinked. That should be mirrored in the database too.

## Occurrences of REPLACE INTO/DELETE FROM

* `edit-message.js` — `REPLACE INTO message_channel`
	* Scary! Changed to INSERT OR IGNORE
* `send-message.js` — `REPLACE INTO message_channel`
	* Changed to INSERT OR IGNORE
* `add-reaction.js` — `REPLACE INTO reaction`
* `channel-webhook.js` — `REPLACE INTO webhook`
* `send-event.js` — `REPLACE INTO message_channel`
	* Seems incorrect? Maybe?? Originally added in fcbb045. Changed to INSERT
* `event-to-message.js` — `REPLACE INTO member_cache`
* `oauth.js` — `REPLACE INTO guild_active`
	* Very scary!! Changed to INSERT .. ON CONFLICT DO UPDATE
* `create-room.js` — `DELETE FROM channel_room`
	* Please cascade
* `delete-message.js`
	* Removed redundant DELETEs
* `edit-message.js` — `DELETE FROM event_message`
* `register-pk-user.js` — `DELETE FROM sim`
	* It's a failsafe during creation
* `register-user.js` — `DELETE FROM sim`
	* It's a failsafe during creation
* `remove-reaction.js` — `DELETE FROM reaction`
* `event-dispatcher.js` — `DELETE FROM member_cache`
* `redact.js` — `DELETE FROM event_message`
	* Removed this redundant DELETE
* `send-event.js` — `DELETE FROM event_message`
	* Removed this redundant DELETE

## How keys

SQLite does not have a complete ALTER TABLE command, so I have to DROP and CREATE. According to [the docs](https://www.sqlite.org/lang_altertable.html), the correct strategy is:

1. (Not applicable) *If foreign key constraints are enabled, disable them using PRAGMA foreign_keys=OFF.*
2. Start a transaction.
3. (Not applicable) *Remember the format of all indexes, triggers, and views associated with table X. This information will be needed in step 8 below. One way to do this is to run a query like the following: SELECT type, sql FROM sqlite_schema WHERE tbl_name='X'.*
4. Use CREATE TABLE to construct a new table "new_X" that is in the desired revised format of table X. Make sure that the name "new_X" does not collide with any existing table name, of course.
5. Transfer content from X into new_X using a statement like: INSERT INTO new_X SELECT ... FROM X.
6. Drop the old table X: DROP TABLE X.
7. Change the name of new_X to X using: ALTER TABLE new_X RENAME TO X.
8. (Not applicable) *Use CREATE INDEX, CREATE TRIGGER, and CREATE VIEW to reconstruct indexes, triggers, and views associated with table X. Perhaps use the old format of the triggers, indexes, and views saved from step 3 above as a guide, making changes as appropriate for the alteration.*
9. (Not applicable) *If any views refer to table X in a way that is affected by the schema change, then drop those views using DROP VIEW and recreate them with whatever changes are necessary to accommodate the schema change using CREATE VIEW.*
10. If foreign key constraints were originally enabled then run PRAGMA foreign_key_check to verify that the schema change did not break any foreign key constraints.
11. Commit the transaction started in step 2.
12. (Not applicable) *If foreign keys constraints were originally enabled, reenable them now.*
