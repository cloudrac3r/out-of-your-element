-- https://sqlite.org/lang_altertable.html

-- 1
PRAGMA foreign_keys=OFF;
-- 2
BEGIN TRANSACTION;

-- 4
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
	"guild_id"	TEXT NOT NULL,
	"custom_topic" INTEGER DEFAULT 0,
	PRIMARY KEY("channel_id"),
	FOREIGN KEY("guild_id") REFERENCES "guild_active"("guild_id") ON DELETE CASCADE
) WITHOUT ROWID;

-- 5
INSERT INTO new_channel_room
      (channel_id, room_id, name, nick, thread_parent, custom_avatar, last_bridged_pin_timestamp, speedbump_id, speedbump_checked, speedbump_webhook_id, guild_id, custom_topic)
SELECT channel_id, room_id, name, nick, thread_parent, custom_avatar, last_bridged_pin_timestamp, speedbump_id, speedbump_checked, speedbump_webhook_id, guild_id, custom_topic
      FROM channel_room;

-- 6
DROP TABLE channel_room;

-- 7
ALTER TABLE new_channel_room RENAME TO channel_room;

-- 10
PRAGMA foreign_key_check;

-- 11
COMMIT;
-- 12
PRAGMA foreign_keys=ON;
