PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;

-- *** historical_channel_room ***

CREATE TABLE "historical_channel_room" (
	"historical_room_index"	INTEGER NOT NULL,
	"reference_channel_id"	TEXT NOT NULL,
	"room_id"	TEXT NOT NULL UNIQUE,
	PRIMARY KEY("historical_room_index" AUTOINCREMENT),
	FOREIGN KEY("reference_channel_id") REFERENCES "channel_room"("channel_id") ON DELETE CASCADE
);

INSERT INTO historical_channel_room (reference_channel_id, room_id) SELECT channel_id, room_id FROM channel_room;

-- *** message_channel -> message_room ***

CREATE TABLE "message_room" (
	"message_id"	TEXT NOT NULL,
	"historical_room_index"	INTEGER NOT NULL,
	PRIMARY KEY("message_id"),
	FOREIGN KEY("historical_room_index") REFERENCES "historical_channel_room"("historical_room_index") ON DELETE CASCADE
) WITHOUT ROWID;
INSERT INTO message_room (message_id, historical_room_index) SELECT message_id, max(historical_room_index) as historical_room_index FROM message_channel INNER JOIN historical_channel_room ON historical_channel_room.reference_channel_id = message_channel.channel_id GROUP BY message_id;

-- *** event_message ***

CREATE TABLE "new_event_message" (
	"event_id"	TEXT NOT NULL,
	"event_type"	TEXT,
	"event_subtype"	TEXT,
	"message_id"	TEXT NOT NULL,
	"part"	INTEGER NOT NULL,
	"reaction_part"	INTEGER NOT NULL,
	"source"	INTEGER NOT NULL,
	PRIMARY KEY("message_id","event_id"),
	FOREIGN KEY("message_id") REFERENCES "message_room"("message_id") ON DELETE CASCADE
) WITHOUT ROWID;
INSERT INTO new_event_message (event_id, event_type, event_subtype, message_id, part, reaction_part, source) SELECT event_id, event_type, event_subtype, message_id, part, reaction_part, source from event_message;
DROP TABLE event_message;
ALTER TABLE new_event_message RENAME TO event_message;

-- *** reaction ***

CREATE TABLE "new_reaction" (
	"hashed_event_id"	INTEGER NOT NULL,
	"message_id"	TEXT NOT NULL,
	"encoded_emoji"	TEXT NOT NULL, original_encoding TEXT,
	PRIMARY KEY("hashed_event_id"),
	FOREIGN KEY("message_id") REFERENCES "message_room"("message_id") ON DELETE CASCADE
) WITHOUT ROWID;
INSERT INTO new_reaction (hashed_event_id, message_id, encoded_emoji) SELECT hashed_event_id, message_id, encoded_emoji FROM reaction;
DROP TABLE reaction;
ALTER TABLE new_reaction RENAME TO reaction;

-- ***

DROP TABLE message_channel;
PRAGMA foreign_key_check;

COMMIT;
PRAGMA foreign_keys=ON;
