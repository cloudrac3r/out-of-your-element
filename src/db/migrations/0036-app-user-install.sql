BEGIN TRANSACTION;

CREATE TABLE "app_user_install" (
	"guild_id"	TEXT NOT NULL,
	"app_bot_id"	TEXT NOT NULL,
	"user_id"	TEXT NOT NULL,
	PRIMARY KEY ("guild_id", "app_bot_id", "user_id")
) WITHOUT ROWID;

COMMIT;
