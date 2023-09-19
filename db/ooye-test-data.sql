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
('114147806469554185', 'extremity', '_ooye_extremity', '@_ooye_extremity:cadence.moe'),
('111604486476181504', 'kyuugryphon', '_ooye_kyuugryphon', '@_ooye_kyuugryphon:cadence.moe');;

INSERT INTO sim_member (mxid, room_id, profile_event_content_hash) VALUES
('@_ooye_bojack_horseman:cadence.moe', '!uCtjHhfGlYbVnPVlkG:cadence.moe', NULL);

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
('1145688633186193481', '1100319550446252084');

INSERT INTO event_message (event_id, event_type, event_subtype, message_id, part, source) VALUES
('$X16nfVks1wsrhq4E9SSLiqrf2N8KD0erD0scZG7U5xg', 'm.room.message', 'm.text', '1126786462646550579', 0, 1),
('$Ij3qo7NxMA4VPexlAiIx2CB9JbsiGhJeyt-2OvkAUe4', 'm.room.message', 'm.text', '1128118177155526666', 0, 0),
('$zXSlyI78DQqQwwfPUSzZ1b-nXzbUrCDljJgnGDdoI10', 'm.room.message', 'm.text', '1141619794500649020', 0, 1),
('$fdD9OZ55xg3EAsfvLZza5tMhtjUO91Wg3Otuo96TplY', 'm.room.message', 'm.text', '1141206225632112650', 0, 1),
('$mtR8cJqM4fKno1bVsm8F4wUVqSntt2sq6jav1lyavuA', 'm.room.message', 'm.text', '1141501302736695316', 0, 1),
('$51f4yqHinwnSbPEQ9dCgoyy4qiIJSX0QYYVUnvwyTCI', 'm.room.message', 'm.image', '1141501302736695316', 1, 1),
('$51f4yqHinwnSbPEQ9dCgoyy4qiIJSX0QYYVUnvwyTCJ', 'm.room.message', 'm.image', '1141501302736695317', 0, 1),
('$vgTKOR5ZTYNMKaS7XvgEIDaOWZtVCEyzLLi5Pc5Gz4M', 'm.room.message', 'm.text', '1128084851279536279', 0, 1),
('$YUJFa5j0ZJe7PUvD2DykRt9g51RoadUEYmuJLdSEbJ0', 'm.room.message', 'm.image', '1128084851279536279', 1, 1),
('$oLyUTyZ_7e_SUzGNWZKz880ll9amLZvXGbArJCKai2Q', 'm.room.message', 'm.text', '1128084748338741392', 0, 1),
('$FchUVylsOfmmbj-VwEs5Z9kY49_dt2zd0vWfylzy5Yo', 'm.room.message', 'm.text', '1143121514925928541', 0, 1),
('$lnAF9IosAECTnlv9p2e18FG8rHn-JgYKHEHIh5qdFv4', 'm.room.message', 'm.text', '1106366167788044450', 0, 1),
('$Ijf1MFCD39ktrNHxrA-i2aKoRWNYdAV2ZXYQeiZIgEU', 'm.room.message', 'm.image', '1106366167788044450', 0, 0),
('$f9cjKiacXI9qPF_nUAckzbiKnJEi0LM399kOkhdd8f8', 'm.sticker', NULL, '1106366167788044450', 0, 0),
('$Fxy8SMoJuTduwReVkHZ1uHif9EuvNx36Hg79cltiA04', 'm.room.message', 'm.text', '1144865310588014633', 0, 1),
('$v_Gtr-bzv9IVlSLBO5DstzwmiDd-GSFaNfHX66IupV8', 'm.room.message', 'm.text', '1144874214311067708', 0, 0),
('$7LIdiJCEqjcWUrpzWzS8TELOlFfBEe4ytgS7zn2lbSs', 'm.room.message', 'm.text', '1145688633186193479', 0, 0),
('$7LIdiJCEqjcWUrpzWzS8TELOlFfBEe4ytgS7zn2lbSt', 'm.room.message', 'm.text', '1145688633186193480', 0, 0),
('$7LIdiJCEqjcWUrpzWzS8TELOlFfBEe4ytgS7zn2lbSt', 'm.room.message', 'm.text', '1145688633186193481', 1, 0);

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
('https://cdn.discordapp.com/emojis/393635038903926784.gif', 'mxc://cadence.moe/WbYqNlACRuicynBfdnPYtmvc');

INSERT INTO emoji (id, name, animated, mxc_url) VALUES
('230201364309868544', 'hippo', 0, 'mxc://cadence.moe/qWmbXeRspZRLPcjseyLmeyXC'),
('393635038903926784', 'hipposcope', 1, 'mxc://cadence.moe/WbYqNlACRuicynBfdnPYtmvc');

INSERT INTO member_cache (room_id, mxid, displayname, avatar_url) VALUES
('!kLRqKKUQXcibIMtOpl:cadence.moe', '@cadence:cadence.moe', 'cadence [they]', NULL),
('!BpMdOUkWWhFxmTrENV:cadence.moe', '@cadence:cadence.moe', 'cadence [they]', 'malformed mxc'),
('!fGgIymcYWOqjbSRUdV:cadence.moe', '@cadence:cadence.moe', 'cadence [they]', 'mxc://cadence.moe/azCAhThKTojXSZJRoWwZmhvU'),
('!PnyBKvUBOhjuCucEfk:cadence.moe', '@cadence:cadence.moe', 'cadence [they]', 'mxc://cadence.moe/azCAhThKTojXSZJRoWwZmhvU');

COMMIT;
