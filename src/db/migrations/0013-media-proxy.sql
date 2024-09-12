BEGIN TRANSACTION;

CREATE TABLE "media_proxy" (
	"permitted_hash"	INTEGER NOT NULL,
	PRIMARY KEY("permitted_hash")
) WITHOUT ROWID;

COMMIT;
