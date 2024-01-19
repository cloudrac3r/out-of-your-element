BEGIN TRANSACTION;

ALTER TABLE channel_room ADD COLUMN speedbump_id TEXT;
ALTER TABLE channel_room ADD COLUMN speedbump_checked INTEGER;

COMMIT;
