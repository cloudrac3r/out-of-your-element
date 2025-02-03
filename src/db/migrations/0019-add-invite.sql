BEGIN TRANSACTION;

CREATE TABLE "invite" (
	"mxid"	TEXT NOT NULL,
	"room_id"	TEXT NOT NULL,
	"type"	TEXT,
	PRIMARY KEY("mxid","room_id")
) WITHOUT ROWID;

COMMIT;
