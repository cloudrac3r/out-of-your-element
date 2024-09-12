BEGIN TRANSACTION;

ALTER TABLE channel_room ADD COLUMN last_bridged_pin_timestamp INTEGER;

COMMIT;
