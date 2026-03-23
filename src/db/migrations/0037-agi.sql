BEGIN TRANSACTION;

CREATE TABLE "agi_prior_message" (
	"channel_id"	TEXT NOT NULL,
	"username"	TEXT NOT NULL,
	"avatar_url"	TEXT NOT NULL,
	"use_caps"	INTEGER NOT NULL,
	"use_punct"	INTEGER NOT NULL,
	"use_apos"	INTEGER NOT NULL,
	"timestamp"	INTEGER NOT NULL,
	PRIMARY KEY("channel_id")
) WITHOUT ROWID;

CREATE TABLE "agi_optout" (
	"guild_id"	TEXT NOT NULL,
	PRIMARY KEY("guild_id")
) WITHOUT ROWID;

CREATE TABLE "agi_cooldown" (
	"guild_id"	TEXT NOT NULL,
	"timestamp"	INTEGER,
	PRIMARY KEY("guild_id")
) WITHOUT ROWID;

COMMIT;
