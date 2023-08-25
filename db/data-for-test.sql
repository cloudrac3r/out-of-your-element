BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS "guild_space" (
	"guild_id"	TEXT NOT NULL UNIQUE,
	"space_id"	TEXT NOT NULL UNIQUE,
	PRIMARY KEY("guild_id")
);
CREATE TABLE IF NOT EXISTS "file" (
	"discord_url"	TEXT NOT NULL UNIQUE,
	"mxc_url"	TEXT NOT NULL UNIQUE,
	PRIMARY KEY("discord_url")
);
CREATE TABLE IF NOT EXISTS "sim" (
	"discord_id"	TEXT NOT NULL UNIQUE,
	"sim_name"	TEXT NOT NULL UNIQUE,
	"localpart"	TEXT NOT NULL UNIQUE,
	"mxid"	TEXT NOT NULL UNIQUE,
	PRIMARY KEY("discord_id")
);
CREATE TABLE IF NOT EXISTS "sim_member" (
	"mxid"	TEXT NOT NULL,
	"room_id"	TEXT NOT NULL,
	"profile_event_content_hash"	BLOB,
	PRIMARY KEY("mxid","room_id")
);
CREATE TABLE IF NOT EXISTS "webhook" (
	"channel_id"	TEXT NOT NULL UNIQUE,
	"webhook_id"	TEXT NOT NULL UNIQUE,
	"webhook_token"	TEXT NOT NULL,
	PRIMARY KEY("channel_id")
);
CREATE TABLE IF NOT EXISTS "channel_room" (
	"channel_id"	TEXT NOT NULL UNIQUE,
	"room_id"	TEXT NOT NULL UNIQUE,
	"name"	TEXT,
	"nick"	TEXT,
	"thread_parent"	TEXT,
	"custom_avatar"	TEXT,
	PRIMARY KEY("channel_id")
);
CREATE TABLE IF NOT EXISTS "event_message" (
	"event_id"	TEXT NOT NULL,
	"event_type"	TEXT,
	"event_subtype"	TEXT,
	"message_id"	TEXT NOT NULL,
	"channel_id"	TEXT,
	"part"	INTEGER NOT NULL,
	"source"	INTEGER NOT NULL,
	PRIMARY KEY("event_id","message_id")
);
COMMIT;



BEGIN TRANSACTION;

INSERT INTO guild_space (guild_id, space_id) VALUES
('112760669178241024', '!jjWAGMeQdNrVZSSfvz:cadence.moe');

INSERT INTO channel_room (channel_id, room_id, name, nick, thread_parent, custom_avatar) VALUES
('112760669178241024', '!kLRqKKUQXcibIMtOpl:cadence.moe', 'heave', 'main', NULL, NULL),
('497161350934560778', '!edUxjVdzgUvXDUIQCK:cadence.moe', 'amanda-spam', NULL, NULL, NULL),
('160197704226439168', '!uCtjHhfGlYbVnPVlkG:cadence.moe', 'the-stanley-parable-channel', 'bots', NULL, NULL),
('1100319550446252084', '!PnyBKvUBOhjuCucEfk:cadence.moe', 'worm-farm', NULL, NULL, NULL);

INSERT INTO sim (discord_id, sim_name, localpart, mxid) VALUES
('0', 'bot', '_ooye_bot', '@_ooye_bot:cadence.moe'),
('820865262526005258', 'crunch_god', '_ooye_crunch_god', '@_ooye_crunch_god:cadence.moe'),
('771520384671416320', 'bojack_horseman', '_ooye_bojack_horseman', '@_ooye_bojack_horseman:cadence.moe'),
('112890272819507200', '.wing.', '_ooye_.wing.', '@_ooye_.wing.:cadence.moe'),
('114147806469554185', 'extremity', '_ooye_extremity', '@_ooye_extremity:cadence.moe');

INSERT INTO sim_member (mxid, room_id, profile_event_content_hash) VALUES
('@_ooye_bojack_horseman:cadence.moe', '!uCtjHhfGlYbVnPVlkG:cadence.moe', NULL);

INSERT INTO event_message (event_id, event_type, event_subtype, message_id, channel_id, part, source) VALUES
('$X16nfVks1wsrhq4E9SSLiqrf2N8KD0erD0scZG7U5xg', 'm.room.message', 'm.text', '1126786462646550579', '112760669178241024', 0, 1),
('$Ij3qo7NxMA4VPexlAiIx2CB9JbsiGhJeyt-2OvkAUe4', 'm.room.message', 'm.text', '1128118177155526666', '112760669178241024', 0, 0),
('$zXSlyI78DQqQwwfPUSzZ1b-nXzbUrCDljJgnGDdoI10', 'm.room.message', 'm.text', '1141619794500649020', '497161350934560778', 0, 1),
('$fdD9OZ55xg3EAsfvLZza5tMhtjUO91Wg3Otuo96TplY', 'm.room.message', 'm.text', '1141206225632112650', '160197704226439168', 0, 1),
('$mtR8cJqM4fKno1bVsm8F4wUVqSntt2sq6jav1lyavuA', 'm.room.message', 'm.text', '1141501302736695316', '112760669178241024', 0, 1),
('$51f4yqHinwnSbPEQ9dCgoyy4qiIJSX0QYYVUnvwyTCI', 'm.room.message', 'm.image', '1141501302736695316', '112760669178241024', 1, 1),
('$51f4yqHinwnSbPEQ9dCgoyy4qiIJSX0QYYVUnvwyTCJ', 'm.room.message', 'm.image', '1141501302736695317', '112760669178241024', 0, 1),
('$vgTKOR5ZTYNMKaS7XvgEIDaOWZtVCEyzLLi5Pc5Gz4M', 'm.room.message', 'm.text', '1128084851279536279', '112760669178241024', 0, 1),
('$YUJFa5j0ZJe7PUvD2DykRt9g51RoadUEYmuJLdSEbJ0', 'm.room.message', 'm.image', '1128084851279536279', '112760669178241024', 1, 1),
('$oLyUTyZ_7e_SUzGNWZKz880ll9amLZvXGbArJCKai2Q', 'm.room.message', 'm.text', '1128084748338741392', '112760669178241024', 0, 1),
('$FchUVylsOfmmbj-VwEs5Z9kY49_dt2zd0vWfylzy5Yo', 'm.room.message', 'm.text', '1143121514925928541', '1100319550446252084', 0, 1),
('$lnAF9IosAECTnlv9p2e18FG8rHn-JgYKHEHIh5qdFv4', 'm.room.message', 'm.text', '1106366167788044450', '122155380120748034', 0, 1),
('$Ijf1MFCD39ktrNHxrA-i2aKoRWNYdAV2ZXYQeiZIgEU', 'm.room.message', 'm.image', '1106366167788044450', '122155380120748034', 0, 0),
('$f9cjKiacXI9qPF_nUAckzbiKnJEi0LM399kOkhdd8f8', 'm.sticker', NULL, '1106366167788044450', '122155380120748034', 0, 0);

INSERT INTO file (discord_url, mxc_url) VALUES
('https://cdn.discordapp.com/attachments/497161332244742154/1124628646431297546/image.png', 'mxc://cadence.moe/qXoZktDqNtEGuOCZEADAMvhM'),
('https://cdn.discordapp.com/attachments/122155380120748034/1106366167486038016/image.png', 'mxc://cadence.moe/ZDCNYnkPszxGKgObUIFmvjus'),
('https://cdn.discordapp.com/stickers/1106323941183717586.png', 'mxc://cadence.moe/UuUaLwXhkxFRwwWCXipDlBHn'),
('https://cdn.discordapp.com/attachments/112760669178241024/1128084747910918195/skull.webp', 'mxc://cadence.moe/sDxWmDErBhYBxtDcJQgBETes'),
('https://cdn.discordapp.com/attachments/112760669178241024/1141501302497615912/piper_2.png', 'mxc://cadence.moe/KQYdXKRcHWjDYDLPkTOOWOjA'),
('https://cdn.discordapp.com/attachments/112760669178241024/1128084851023675515/RDT_20230704_0936184915846675925224905.jpg', 'mxc://cadence.moe/WlAbFSiNRIHPDEwKdyPeGywa'),
('https://cdn.discordapp.com/guilds/112760669178241024/users/134826546694193153/avatars/38dd359aa12bcd52dd3164126c587f8c.png?size=1024', 'mxc://cadence.moe/rfemHmAtcprjLEiPiEuzPhpl'),
('https://cdn.discordapp.com/icons/112760669178241024/a_f83622e09ead74f0c5c527fe241f8f8c.png?size=1024', 'mxc://cadence.moe/zKXGZhmImMHuGQZWJEFKJbsF'),
('https://cdn.discordapp.com/avatars/113340068197859328/b48302623a12bc7c59a71328f72ccb39.png?size=1024', 'mxc://cadence.moe/UpAeIqeclhKfeiZNdIWNcXXL');

COMMIT;
