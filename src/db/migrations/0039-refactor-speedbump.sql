BEGIN TRANSACTION;

CREATE TABLE "channel_speedbump" (
	"channel_id"	TEXT NOT NULL,
	"speedbump_webhook_id"	TEXT NOT NULL,
	"speedbump_user_id"	TEXT NOT NULL,
	PRIMARY KEY("channel_id","speedbump_webhook_id"),
	FOREIGN KEY("channel_id") REFERENCES "channel_room"("channel_id")
) WITHOUT ROWID;

INSERT INTO channel_speedbump (channel_id, speedbump_webhook_id, speedbump_user_id)
	SELECT channel_id, speedbump_webhook_id, speedbump_id FROM channel_room WHERE speedbump_id IS NOT NULL AND speedbump_webhook_id IS NOT NULL;

ALTER TABLE channel_room DROP COLUMN speedbump_id;
ALTER TABLE channel_room DROP COLUMN speedbump_webhook_id;

ALTER TABLE sim_proxy ADD COLUMN proxy_app INTEGER DEFAULT 0;

COMMIT;
