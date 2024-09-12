BEGIN TRANSACTION;

-- the power we want them to have
CREATE TABLE IF NOT EXISTS member_power (
	mxid			TEXT NOT NULL,
	room_id		TEXT NOT NULL,
	power_level	INTEGER NOT NULL,
	PRIMARY KEY(mxid, room_id)
) WITHOUT ROWID;

-- the power they have
ALTER TABLE member_cache ADD COLUMN power_level INTEGER NOT NULL DEFAULT 0;

COMMIT;
