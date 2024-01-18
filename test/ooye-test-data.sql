BEGIN TRANSACTION;

INSERT INTO guild_space (guild_id, space_id, privacy_level) VALUES
('112760669178241024', '!jjWAGMeQdNrVZSSfvz:cadence.moe', 0);

INSERT INTO channel_room (channel_id, room_id, name, nick, thread_parent, custom_avatar) VALUES
('112760669178241024', '!kLRqKKUQXcibIMtOpl:cadence.moe', 'heave', 'main', NULL, NULL),
('497161350934560778', '!CzvdIdUQXgUjDVKxeU:cadence.moe', 'amanda-spam', NULL, NULL, NULL),
('160197704226439168', '!hYnGGlPHlbujVVfktC:cadence.moe', 'the-stanley-parable-channel', 'bots', NULL, NULL),
('1100319550446252084', '!BnKuBPCvyfOkhcUjEu:cadence.moe', 'worm-farm', NULL, NULL, NULL),
('1162005314908999790', '!FuDZhlOAtqswlyxzeR:cadence.moe', 'Hey.', NULL, '1100319550446252084', NULL),
('297272183716052993', '!rEOspnYqdOalaIFniV:cadence.moe', 'general', NULL, NULL, NULL),
('122155380120748034', '!cqeGDbPiMFAhLsqqqq:cadence.moe', 'cadences-mind', 'coding', NULL, NULL),
('176333891320283136', '!qzDBLKlildpzrrOnFZ:cadence.moe', '🌈丨davids-horse_she-took-the-kids', 'wonderland', NULL, 'mxc://cadence.moe/EVvrSkKIRONHjtRJsMLmHWLS');

INSERT INTO sim (user_id, sim_name, localpart, mxid) VALUES
('0', 'bot', '_ooye_bot', '@_ooye_bot:cadence.moe'),
('820865262526005258', 'crunch_god', '_ooye_crunch_god', '@_ooye_crunch_god:cadence.moe'),
('771520384671416320', 'bojack_horseman', '_ooye_bojack_horseman', '@_ooye_bojack_horseman:cadence.moe'),
('112890272819507200', '.wing.', '_ooye_.wing.', '@_ooye_.wing.:cadence.moe'),
('114147806469554185', 'extremity', '_ooye_extremity', '@_ooye_extremity:cadence.moe'),
('111604486476181504', 'kyuugryphon', '_ooye_kyuugryphon', '@_ooye_kyuugryphon:cadence.moe'),
('1109360903096369153', 'amanda', '_ooye_amanda', '@_ooye_amanda:cadence.moe');

INSERT INTO sim_member (mxid, room_id, hashed_profile_content) VALUES
('@_ooye_bojack_horseman:cadence.moe', '!hYnGGlPHlbujVVfktC:cadence.moe', NULL);

INSERT INTO message_channel (message_id, channel_id) VALUES
('1106366167788044450', '122155380120748034'),
('1126786462646550579', '112760669178241024'),
('1128084748338741392', '112760669178241024'),
('1128084851279536279', '112760669178241024'),
('1128118177155526666', '112760669178241024'),
('1141206225632112650', '160197704226439168'),
('1141501302736695316', '112760669178241024'),
('1141501302736695317', '112760669178241024'),
('1141619794500649020', '497161350934560778'),
('1143121514925928541', '1100319550446252084'),
('1144865310588014633', '687028734322147344'),
('1145688633186193479', '1100319550446252084'),
('1145688633186193480', '1100319550446252084'),
('1145688633186193481', '1100319550446252084'),
('1162005526675193909', '1162005314908999790'),
('1162625810109317170', '497161350934560778'),
('1158842413025071135', '176333891320283136'),
('1197612733600895076', '112760669178241024');

INSERT INTO event_message (event_id, event_type, event_subtype, message_id, part, reaction_part, source) VALUES
('$X16nfVks1wsrhq4E9SSLiqrf2N8KD0erD0scZG7U5xg', 'm.room.message', 'm.text', '1126786462646550579', 0, 0, 1),
('$Ij3qo7NxMA4VPexlAiIx2CB9JbsiGhJeyt-2OvkAUe4', 'm.room.message', 'm.text', '1128118177155526666', 0, 0, 0),
('$zXSlyI78DQqQwwfPUSzZ1b-nXzbUrCDljJgnGDdoI10', 'm.room.message', 'm.text', '1141619794500649020', 0, 0, 1),
('$fdD9OZ55xg3EAsfvLZza5tMhtjUO91Wg3Otuo96TplY', 'm.room.message', 'm.text', '1141206225632112650', 0, 0, 1),
('$mtR8cJqM4fKno1bVsm8F4wUVqSntt2sq6jav1lyavuA', 'm.room.message', 'm.text', '1141501302736695316', 0, 1, 1),
('$51f4yqHinwnSbPEQ9dCgoyy4qiIJSX0QYYVUnvwyTCI', 'm.room.message', 'm.image', '1141501302736695316', 1, 0, 1),
('$51f4yqHinwnSbPEQ9dCgoyy4qiIJSX0QYYVUnvwyTCJ', 'm.room.message', 'm.image', '1141501302736695317', 0, 0, 1),
('$vgTKOR5ZTYNMKaS7XvgEIDaOWZtVCEyzLLi5Pc5Gz4M', 'm.room.message', 'm.text', '1128084851279536279', 0, 1, 1),
('$YUJFa5j0ZJe7PUvD2DykRt9g51RoadUEYmuJLdSEbJ0', 'm.room.message', 'm.image', '1128084851279536279', 1, 0, 1),
('$oLyUTyZ_7e_SUzGNWZKz880ll9amLZvXGbArJCKai2Q', 'm.room.message', 'm.text', '1128084748338741392', 0, 0, 1),
('$FchUVylsOfmmbj-VwEs5Z9kY49_dt2zd0vWfylzy5Yo', 'm.room.message', 'm.text', '1143121514925928541', 0, 0, 1),
('$lnAF9IosAECTnlv9p2e18FG8rHn-JgYKHEHIh5qdFv4', 'm.room.message', 'm.text', '1106366167788044450', 0, 1, 1),
('$Ijf1MFCD39ktrNHxrA-i2aKoRWNYdAV2ZXYQeiZIgEU', 'm.room.message', 'm.image', '1106366167788044450', 1, 1, 0),
('$f9cjKiacXI9qPF_nUAckzbiKnJEi0LM399kOkhdd8f8', 'm.sticker', NULL, '1106366167788044450', 1, 0, 0),
('$Fxy8SMoJuTduwReVkHZ1uHif9EuvNx36Hg79cltiA04', 'm.room.message', 'm.text', '1144865310588014633', 0, 0, 1),
('$v_Gtr-bzv9IVlSLBO5DstzwmiDd-GSFaNfHX66IupV8', 'm.room.message', 'm.text', '1144874214311067708', 0, 0, 0),
('$7LIdiJCEqjcWUrpzWzS8TELOlFfBEe4ytgS7zn2lbSs', 'm.room.message', 'm.text', '1145688633186193479', 0, 0, 0),
('$7LIdiJCEqjcWUrpzWzS8TELOlFfBEe4ytgS7zn2lbSt', 'm.room.message', 'm.text', '1145688633186193480', 0, 0, 0),
('$7LIdiJCEqjcWUrpzWzS8TELOlFfBEe4ytgS7zn2lbSt', 'm.room.message', 'm.text', '1145688633186193481', 1, 0, 0),
('$nUM-ABBF8KdnvrhXwLlYAE9dgDl_tskOvvcNIBrtsVo', 'm.room.message', 'm.text', '1162005526675193909', 0, 0, 0),
('$0wEdIP8fhTq-P68xwo_gyUw-Zv0KA2aS2tfhdFSrLZc', 'm.room.message', 'm.text', '1162625810109317170', 1, 1, 1),
('$zJFjTvNn1w_YqpR4o4ISKUFisNRgZcu1KSMI_LADPVQ', 'm.room.message', 'm.notice', '1162625810109317170', 1, 0, 1),
('$dVCLyj6kxb3DaAWDtjcv2kdSny8JMMHdDhCMz8mDxVo', 'm.room.message', 'm.text', '1158842413025071135', 0, 0, 1),
('$7tJoMw1h44n2gxgLUE1T_YinGrLbK0x-TDY1z6M7GBw', 'm.room.message', 'm.text', '1197612733600895076', 0, 0, 1);

INSERT INTO file (discord_url, mxc_url) VALUES
('https://cdn.discordapp.com/attachments/497161332244742154/1124628646431297546/image.png', 'mxc://cadence.moe/qXoZktDqNtEGuOCZEADAMvhM'),
('https://cdn.discordapp.com/attachments/122155380120748034/1106366167486038016/image.png', 'mxc://cadence.moe/ZDCNYnkPszxGKgObUIFmvjus'),
('https://cdn.discordapp.com/stickers/1106323941183717586.png', 'mxc://cadence.moe/UuUaLwXhkxFRwwWCXipDlBHn'),
('https://cdn.discordapp.com/attachments/112760669178241024/1128084747910918195/skull.webp', 'mxc://cadence.moe/sDxWmDErBhYBxtDcJQgBETes'),
('https://cdn.discordapp.com/attachments/112760669178241024/1141501302497615912/piper_2.png', 'mxc://cadence.moe/KQYdXKRcHWjDYDLPkTOOWOjA'),
('https://cdn.discordapp.com/attachments/112760669178241024/1128084851023675515/RDT_20230704_0936184915846675925224905.jpg', 'mxc://cadence.moe/WlAbFSiNRIHPDEwKdyPeGywa'),
('https://cdn.discordapp.com/guilds/112760669178241024/users/134826546694193153/avatars/38dd359aa12bcd52dd3164126c587f8c.png?size=1024', 'mxc://cadence.moe/rfemHmAtcprjLEiPiEuzPhpl'),
('https://cdn.discordapp.com/icons/112760669178241024/a_f83622e09ead74f0c5c527fe241f8f8c.png?size=1024', 'mxc://cadence.moe/zKXGZhmImMHuGQZWJEFKJbsF'),
('https://cdn.discordapp.com/avatars/113340068197859328/b48302623a12bc7c59a71328f72ccb39.png?size=1024', 'mxc://cadence.moe/UpAeIqeclhKfeiZNdIWNcXXL'),
('https://cdn.discordapp.com/emojis/230201364309868544.png', 'mxc://cadence.moe/qWmbXeRspZRLPcjseyLmeyXC'),
('https://cdn.discordapp.com/emojis/393635038903926784.gif', 'mxc://cadence.moe/WbYqNlACRuicynBfdnPYtmvc'),
('https://cdn.discordapp.com/attachments/176333891320283136/1157854643037163610/Screenshot_20231001_034036.jpg', 'mxc://cadence.moe/zAXdQriaJuLZohDDmacwWWDR'),
('https://cdn.discordapp.com/emojis/1125827250609201255.png', 'mxc://cadence.moe/pgdGTxAyEltccRgZKxdqzHHP'),
('https://cdn.discordapp.com/avatars/320067006521147393/5fc4ad85c1ea876709e9a7d3374a78a1.png?size=1024', 'mxc://cadence.moe/JPzSmALLirnIprlSMKohSSoX'),
('https://cdn.discordapp.com/emojis/288858540888686602.png', 'mxc://cadence.moe/mwZaCtRGAQQyOItagDeCocEO'),
('https://cdn.discordapp.com/attachments/112760669178241024/1197621094786531358/Ins_1960637570.mp4', 'mxc://cadence.moe/kMqLycqMURhVpwleWkmASpnU');

INSERT INTO emoji (emoji_id, name, animated, mxc_url) VALUES
('230201364309868544', 'hippo', 0, 'mxc://cadence.moe/qWmbXeRspZRLPcjseyLmeyXC'),
('393635038903926784', 'hipposcope', 1, 'mxc://cadence.moe/WbYqNlACRuicynBfdnPYtmvc'),
('362741439211503616', 'bn_re', 0, 'mxc://cadence.moe/OIpqpfxTnHKokcsYqDusxkBT'),
('551636841284108289', 'ae_botrac4r', 0, 'mxc://cadence.moe/skqfuItqxNmBYekzmVKyoLzs'),
('975572106295259148', 'brillillillilliant_move', 0, 'mxc://cadence.moe/scfRIDOGKWFDEBjVXocWYQHik'),
('606664341298872324', 'online', 0, 'mxc://cadence.moe/LCEqjStXCxvRQccEkuslXEyZ'),
('288858540888686602', 'upstinky', 0, 'mxc://cadence.moe/mwZaCtRGAQQyOItagDeCocEO');

INSERT INTO member_cache (room_id, mxid, displayname, avatar_url) VALUES
('!kLRqKKUQXcibIMtOpl:cadence.moe', '@cadence:cadence.moe', 'cadence [they]', NULL),
('!BpMdOUkWWhFxmTrENV:cadence.moe', '@cadence:cadence.moe', 'cadence [they]', 'malformed mxc'),
('!fGgIymcYWOqjbSRUdV:cadence.moe', '@cadence:cadence.moe', 'cadence [they]', 'mxc://cadence.moe/azCAhThKTojXSZJRoWwZmhvU'),
('!BnKuBPCvyfOkhcUjEu:cadence.moe', '@cadence:cadence.moe', 'cadence [they]', 'mxc://cadence.moe/azCAhThKTojXSZJRoWwZmhvU'),
('!maggESguZBqGBZtSnr:cadence.moe', '@cadence:cadence.moe', 'cadence [they]', 'mxc://cadence.moe/azCAhThKTojXSZJRoWwZmhvU'),
('!CzvdIdUQXgUjDVKxeU:cadence.moe', '@cadence:cadence.moe', 'cadence [they]', 'mxc://cadence.moe/azCAhThKTojXSZJRoWwZmhvU'),
('!cBxtVRxDlZvSVhJXVK:cadence.moe', '@Milan:tchncs.de', 'Milan', NULL);

INSERT INTO lottie (sticker_id, mxc_url) VALUES
('860171525772279849', 'mxc://cadence.moe/ZtvvVbwMIdUZeovWVyGVFCeR');

INSERT INTO "auto_emoji" ("name","emoji_id","guild_id") VALUES
('L1','1144820033948762203','529176156398682115'),
('L2','1144820084079087647','529176156398682115'),
('_','_','529176156398682115');

COMMIT;
