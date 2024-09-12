BEGIN TRANSACTION;

-- Add column reaction_part to event_message, copying the existing value from part

CREATE TABLE "new_event_message" (
	"event_id"	TEXT NOT NULL,
	"event_type"	TEXT,
	"event_subtype"	TEXT,
	"message_id"	TEXT NOT NULL,
	"part"	INTEGER NOT NULL,
	"reaction_part" INTEGER NOT NULL,
	"source"	INTEGER NOT NULL,
	PRIMARY KEY("message_id","event_id")
) WITHOUT ROWID;

INSERT INTO new_event_message SELECT event_id, event_type, event_subtype, message_id, part, part, source FROM event_message;

DROP TABLE event_message;

ALTER TABLE new_event_message RENAME TO event_message;

COMMIT;

VACUUM;
