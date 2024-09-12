BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS "sim" (
	"discord_id"	TEXT NOT NULL,
	"sim_name"	TEXT NOT NULL UNIQUE,
	"localpart"	TEXT NOT NULL,
	"mxid"	TEXT NOT NULL,
	PRIMARY KEY("discord_id")
);

CREATE TABLE IF NOT EXISTS "webhook" (
	"channel_id"	TEXT NOT NULL,
	"webhook_id"	TEXT NOT NULL,
	"webhook_token"	TEXT NOT NULL,
	PRIMARY KEY("channel_id")
);

CREATE TABLE IF NOT EXISTS "sim_member" (
	"mxid"	TEXT NOT NULL,
	"room_id"	TEXT NOT NULL,
	"profile_event_content_hash"	BLOB,
	PRIMARY KEY("room_id","mxid")
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS "member_cache" (
	"room_id"	TEXT NOT NULL,
	"mxid"	TEXT NOT NULL,
	"displayname"	TEXT,
	"avatar_url"	TEXT,
	PRIMARY KEY("room_id","mxid")
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS "file" (
	"discord_url"	TEXT NOT NULL,
	"mxc_url"	TEXT NOT NULL,
	PRIMARY KEY("discord_url")
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS "guild_space" (
	"guild_id"	TEXT NOT NULL,
	"space_id"	TEXT NOT NULL,
	PRIMARY KEY("guild_id")
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS "channel_room" (
	"channel_id"	TEXT NOT NULL,
	"room_id"	TEXT NOT NULL,
	"name"	TEXT NOT NULL,
	"nick"	TEXT,
	"thread_parent"	TEXT,
	"custom_avatar"	TEXT,
	PRIMARY KEY("channel_id","room_id")
);

CREATE TABLE IF NOT EXISTS "message_channel" (
	"message_id"	TEXT NOT NULL,
	"channel_id"	TEXT NOT NULL,
	PRIMARY KEY("message_id")
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS "event_message" (
	"event_id"	TEXT NOT NULL,
	"message_id"	TEXT NOT NULL,
	"event_type"	TEXT,
	"event_subtype"	TEXT,
	"part"	INTEGER NOT NULL,
	"source"	INTEGER NOT NULL,
	PRIMARY KEY("message_id","event_id")
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS "lottie" (
	"id"	TEXT NOT NULL,
	"mxc"	TEXT NOT NULL,
	PRIMARY KEY("id")
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS "emoji" (
	"id"	TEXT NOT NULL,
	"name"	TEXT NOT NULL,
	"animated"	INTEGER NOT NULL,
	"mxc_url"	TEXT NOT NULL,
	PRIMARY KEY("id")
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS "reaction" (
	"hashed_event_id"	INTEGER NOT NULL,
	"message_id"	TEXT NOT NULL,
	"encoded_emoji"	TEXT NOT NULL,
	PRIMARY KEY ("hashed_event_id")
) WITHOUT ROWID;

COMMIT;
