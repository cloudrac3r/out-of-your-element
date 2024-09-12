BEGIN TRANSACTION;

-- Change hashed_profile_content column affinity to INTEGER

CREATE TABLE "new_sim_member" (
	"mxid"	TEXT NOT NULL,
	"room_id"	TEXT NOT NULL,
	"hashed_profile_content"	INTEGER,
	PRIMARY KEY("room_id","mxid")
) WITHOUT ROWID;

INSERT INTO new_sim_member SELECT * FROM sim_member;

DROP TABLE sim_member;

ALTER TABLE new_sim_member RENAME TO sim_member;

COMMIT;

VACUUM;
