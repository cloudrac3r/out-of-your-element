BEGIN TRANSACTION;

CREATE TABLE room_upgrade_pending (
	new_room_id TEXT NOT NULL,
	old_room_id TEXT NOT NULL UNIQUE,
	PRIMARY KEY (new_room_id),
	FOREIGN KEY (old_room_id) REFERENCES channel_room (room_id) ON DELETE CASCADE
) WITHOUT ROWID;

COMMIT;
