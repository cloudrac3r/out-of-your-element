BEGIN TRANSACTION;

CREATE TABLE "role_default" (
	"guild_id"	TEXT NOT NULL,
	"role_id"	TEXT NOT NULL,
	PRIMARY KEY ("guild_id", "role_id")
);

COMMIT;
