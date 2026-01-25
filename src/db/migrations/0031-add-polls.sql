BEGIN TRANSACTION;

CREATE TABLE "poll_option" (
	"message_id"	TEXT NOT NULL,
	"matrix_option"	TEXT NOT NULL,
	"discord_option"	TEXT NOT NULL,
	PRIMARY KEY("message_id","matrix_option")
	FOREIGN KEY ("message_id") REFERENCES "message_channel" ("message_id") ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE "poll_vote" (
	"vote"	TEXT NOT NULL,
	"message_id"	TEXT NOT NULL,
	"discord_or_matrix_user_id"	TEXT NOT NULL,
	PRIMARY KEY("vote","message_id","discord_or_matrix_user_id"),
	FOREIGN KEY("message_id") REFERENCES "message_channel" ("message_id") ON DELETE CASCADE
) WITHOUT ROWID;

COMMIT;
