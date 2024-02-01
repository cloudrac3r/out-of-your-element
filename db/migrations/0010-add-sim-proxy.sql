CREATE TABLE IF NOT EXISTS sim_proxy (
	user_id TEXT NOT NULL,
	proxy_owner_id TEXT NOT NULL,
	displayname TEXT NOT NULL,
	PRIMARY KEY(user_id)
) WITHOUT ROWID;
