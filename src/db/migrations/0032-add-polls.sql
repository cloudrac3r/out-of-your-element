BEGIN TRANSACTION;

DROP TABLE IF EXISTS "poll";
DROP TABLE IF EXISTS "poll_option";
DROP TABLE IF EXISTS "poll_vote";

CREATE TABLE "poll" (
	"message_id"	TEXT NOT NULL,
	"max_selections"	INTEGER NOT NULL,
	"question_text"	TEXT NOT NULL,
	"is_closed"	INTEGER NOT NULL,
	PRIMARY KEY ("message_id"),
	FOREIGN KEY ("message_id") REFERENCES "message_room" ("message_id") ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE "poll_option" (
	"message_id"	TEXT NOT NULL,
	"matrix_option"	TEXT NOT NULL,
	"discord_option"	TEXT,
	"option_text"	TEXT NOT NULL,
	"seq"	INTEGER NOT NULL,
	PRIMARY KEY ("message_id", "matrix_option"),
	FOREIGN KEY ("message_id") REFERENCES "poll" ("message_id") ON DELETE CASCADE
) WITHOUT ROWID;

CREATE TABLE "poll_vote" (
	"message_id"	TEXT NOT NULL,
	"matrix_option"	TEXT NOT NULL,
	"discord_or_matrix_user_id"	TEXT NOT NULL,
	PRIMARY KEY ("message_id", "matrix_option", "discord_or_matrix_user_id"),
	FOREIGN KEY ("message_id", "matrix_option") REFERENCES "poll_option" ("message_id", "matrix_option") ON DELETE CASCADE
) WITHOUT ROWID;

COMMIT;
