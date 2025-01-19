-- /docs/foreign-keys.md

-- 2
BEGIN TRANSACTION;

-- *** channel_room ***

-- 4
-- adding UNIQUE to room_id here will auto-generate the usable index we wanted
CREATE TABLE "new_channel_room" (
	"channel_id"	TEXT NOT NULL,
	"room_id"	TEXT NOT NULL UNIQUE,
	"name"	TEXT NOT NULL,
	"nick"	TEXT,
	"thread_parent"	TEXT,
	"custom_avatar"	TEXT,
	"last_bridged_pin_timestamp"	INTEGER,
	"speedbump_id"	TEXT,
	"speedbump_checked"	INTEGER,
	"speedbump_webhook_id"	TEXT,
	"guild_id"	TEXT,
	PRIMARY KEY("channel_id"),
	FOREIGN KEY("guild_id") REFERENCES "guild_active"("guild_id") ON DELETE CASCADE
) WITHOUT ROWID;
-- 5
INSERT INTO new_channel_room (channel_id, room_id, name, nick, thread_parent, custom_avatar, last_bridged_pin_timestamp, speedbump_id, speedbump_checked, speedbump_webhook_id, guild_id) SELECT channel_id, room_id, name, nick, thread_parent, custom_avatar, last_bridged_pin_timestamp, speedbump_id, speedbump_checked, speedbump_webhook_id, guild_id FROM channel_room;
-- 6
DROP TABLE channel_room;
-- 7
ALTER TABLE new_channel_room RENAME TO channel_room;

-- *** message_channel ***

-- 4
CREATE TABLE "new_message_channel" (
	"message_id"	TEXT NOT NULL,
	"channel_id"	TEXT NOT NULL,
	PRIMARY KEY("message_id"),
	FOREIGN KEY("channel_id") REFERENCES "channel_room"("channel_id") ON DELETE CASCADE
) WITHOUT ROWID;
-- 5
-- don't copy any orphaned messages
INSERT INTO new_message_channel (message_id, channel_id) SELECT message_id, channel_id FROM message_channel WHERE channel_id IN (SELECT channel_id FROM channel_room);
-- 6
DROP TABLE message_channel;
-- 7
ALTER TABLE new_message_channel RENAME TO message_channel;

-- *** event_message ***

-- clean up any orphaned events
DELETE FROM event_message WHERE message_id NOT IN (SELECT message_id FROM message_channel);
-- 4
CREATE TABLE "new_event_message" (
	"event_id"	TEXT NOT NULL,
	"event_type"	TEXT,
	"event_subtype"	TEXT,
	"message_id"	TEXT NOT NULL,
	"part"	INTEGER NOT NULL,
	"reaction_part"	INTEGER NOT NULL,
	"source"	INTEGER NOT NULL,
	PRIMARY KEY("message_id","event_id"),
	FOREIGN KEY("message_id") REFERENCES "message_channel"("message_id") ON DELETE CASCADE
) WITHOUT ROWID;
-- 5
INSERT INTO new_event_message (event_id, event_type, event_subtype, message_id, part, reaction_part, source) SELECT event_id, event_type, event_subtype, message_id, part, reaction_part, source FROM event_message;
-- 6
DROP TABLE event_message;
-- 7
ALTER TABLE new_event_message RENAME TO event_message;

-- *** guild_space ***

-- 4
CREATE TABLE "new_guild_space" (
	"guild_id"	TEXT NOT NULL,
	"space_id"	TEXT NOT NULL,
	"privacy_level"	INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY("guild_id"),
	FOREIGN KEY("guild_id") REFERENCES "guild_active"("guild_id") ON DELETE CASCADE
) WITHOUT ROWID;
-- 5
INSERT INTO new_guild_space (guild_id, space_id, privacy_level) SELECT guild_id, space_id, privacy_level FROM guild_space;
-- 6
DROP TABLE guild_space;
-- 7
ALTER TABLE new_guild_space RENAME TO guild_space;

-- *** reaction ***

-- 4
CREATE TABLE "new_reaction" (
	"hashed_event_id"	INTEGER NOT NULL,
	"message_id"	TEXT NOT NULL,
	"encoded_emoji"	TEXT NOT NULL,
	PRIMARY KEY("hashed_event_id"),
	FOREIGN KEY("message_id") REFERENCES "message_channel"("message_id") ON DELETE CASCADE
) WITHOUT ROWID;
-- 5
INSERT INTO new_reaction (hashed_event_id, message_id, encoded_emoji) SELECT hashed_event_id, message_id, encoded_emoji FROM reaction WHERE message_id IN (SELECT message_id FROM message_channel);
-- 6
DROP TABLE reaction;
-- 7
ALTER TABLE new_reaction RENAME TO reaction;

-- *** webhook ***

-- 4
-- using RESTRICT instead of CASCADE as a reminder that the webhooks also need to be deleted using the Discord API, it can't just be entirely automatic
CREATE TABLE "new_webhook" (
	"channel_id"	TEXT NOT NULL,
	"webhook_id"	TEXT NOT NULL,
	"webhook_token"	TEXT NOT NULL,
	PRIMARY KEY("channel_id"),
	FOREIGN KEY("channel_id") REFERENCES "channel_room"("channel_id") ON DELETE RESTRICT
) WITHOUT ROWID;
-- 5
INSERT INTO new_webhook (channel_id, webhook_id, webhook_token) SELECT channel_id, webhook_id, webhook_token FROM webhook WHERE channel_id IN (SELECT channel_id FROM channel_room);
-- 6
DROP TABLE webhook;
-- 7
ALTER TABLE new_webhook RENAME TO webhook;

-- *** sim ***

-- 4
-- while we're at it, rebuild this table to give it WITHOUT ROWID, remove UNIQUE, and replace the localpart column with username. no foreign keys needed
CREATE TABLE "new_sim" (
	"user_id"	TEXT NOT NULL,
	"username"	TEXT NOT NULL,
	"sim_name"	TEXT NOT NULL,
	"mxid"	TEXT NOT NULL,
	PRIMARY KEY("user_id")
) WITHOUT ROWID;
-- 5
INSERT INTO new_sim (user_id, username, sim_name, mxid) SELECT user_id, sim_name, sim_name, mxid FROM sim;
-- 6
DROP TABLE sim;
-- 7
ALTER TABLE new_sim RENAME TO sim;

-- *** end ***

-- 10
PRAGMA foreign_key_check;
-- 11
COMMIT;
