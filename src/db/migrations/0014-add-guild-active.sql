BEGIN TRANSACTION;

CREATE TABLE "guild_active" (
	"guild_id"	TEXT NOT NULL,
	"autocreate"	INTEGER NOT NULL,
	PRIMARY KEY("guild_id")
) WITHOUT ROWID;

INSERT INTO guild_active (guild_id, autocreate) SELECT guild_id, 1 FROM guild_space;

COMMIT;
