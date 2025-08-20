BEGIN TRANSACTION;

INSERT INTO guild_active (guild_id, autocreate) VALUES
('112760669178241024', 1),
('66192955777486848', 1),
('665289423482519565', 0);

INSERT INTO guild_space (guild_id, space_id, privacy_level) VALUES
('112760669178241024', '!jjmvBegULiLucuWEHU:cadence.moe', 0);

INSERT INTO channel_room (channel_id, room_id, name, nick, thread_parent, custom_avatar) VALUES
('112760669178241024', '!kLRqKKUQXcibIMtOpl:cadence.moe', 'heave', 'main', NULL, NULL),
('687028734322147344', '!fGgIymcYWOqjbSRUdV:cadence.moe', 'slow-news-day', NULL, NULL, NULL),
('497161350934560778', '!CzvdIdUQXgUjDVKxeU:cadence.moe', 'amanda-spam', NULL, NULL, NULL),
('160197704226439168', '!hYnGGlPHlbujVVfktC:cadence.moe', 'the-stanley-parable-channel', 'bots', NULL, NULL),
('1100319550446252084', '!BnKuBPCvyfOkhcUjEu:cadence.moe', 'worm-farm', NULL, NULL, NULL),
('1162005314908999790', '!FuDZhlOAtqswlyxzeR:cadence.moe', 'Hey.', NULL, '1100319550446252084', NULL),
('297272183716052993', '!rEOspnYqdOalaIFniV:cadence.moe', 'general', NULL, NULL, NULL),
('122155380120748034', '!cqeGDbPiMFAhLsqqqq:cadence.moe', 'cadences-mind', 'coding', NULL, NULL),
('176333891320283136', '!qzDBLKlildpzrrOnFZ:cadence.moe', '🌈丨davids-horse_she-took-the-kids', 'wonderland', NULL, 'mxc://cadence.moe/EVvrSkKIRONHjtRJsMLmHWLS'),
('489237891895768942', '!tnedrGVYKFNUdnegvf:tchncs.de', 'ex-room-doesnt-exist-any-more', NULL, NULL, NULL),
('1160894080998461480', '!TqlyQmifxGUggEmdBN:cadence.moe', 'ooyexperiment', NULL, NULL, NULL),
('1161864271370666075', '!mHmhQQPwXNananMUqq:cadence.moe', 'updates', NULL, NULL, NULL);

INSERT INTO sim (user_id, username, sim_name, mxid) VALUES
('0',                  'Matrix Bridge', 'bot', '@_ooye_bot:cadence.moe'),
('820865262526005258', 'Crunch God', 'crunch_god', '@_ooye_crunch_god:cadence.moe'),
('771520384671416320', 'Bojack Horseman', 'bojack_horseman', '@_ooye_bojack_horseman:cadence.moe'),
('112890272819507200', 'wing', '.wing.', '@_ooye_.wing.:cadence.moe'),
('114147806469554185', 'extremity', 'extremity', '@_ooye_extremity:cadence.moe'),
('111604486476181504', 'kyuugryphon', 'kyuugryphon', '@_ooye_kyuugryphon:cadence.moe'),
('1109360903096369153', 'Amanda', 'amanda', '@_ooye_amanda:cadence.moe'),
('43d378d5-1183-47dc-ab3c-d14e21c3fe58', '_pk_zoego', '_pk_zoego', '@_ooye__pk_zoego:cadence.moe'),
('320067006521147393', 'papiophidian', 'papiophidian', '@_ooye_papiophidian:cadence.moe'),
('772659086046658620', 'cadence.worm', 'cadence', '@_ooye_cadence:cadence.moe');

INSERT INTO sim_member (mxid, room_id, hashed_profile_content) VALUES
('@_ooye_bojack_horseman:cadence.moe', '!hYnGGlPHlbujVVfktC:cadence.moe', NULL),
('@_ooye_cadence:cadence.moe', '!BnKuBPCvyfOkhcUjEu:cadence.moe', NULL);

INSERT INTO sim_proxy (user_id, proxy_owner_id, displayname) VALUES
('43d378d5-1183-47dc-ab3c-d14e21c3fe58', '196188877885538304', 'Azalea &flwr; 🌺');

INSERT INTO message_channel (message_id, channel_id) VALUES
('1106366167788044450', '122155380120748034'),
('1106366167788044451', '122155380120748034'),
('1106366167788044452', '122155380120748034'),
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
('1197612733600895076', '112760669178241024'),
('1202543413652881428', '1160894080998461480'),
('1207486471489986620', '1160894080998461480'),
('1210387798297682020', '112760669178241024'),
('1273204543739396116', '687028734322147344'),
('1273743950028607530', '1100319550446252084'),
('1278002262400176128', '1100319550446252084'),
('1278001833876525057', '1100319550446252084'),
('1191567971970191490', '176333891320283136'),
('1144874214311067708', '687028734322147344'),
('1339000288144658482', '176333891320283136'),
('1381212840957972480', '112760669178241024'),
('1401760355339862066', '112760669178241024');

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
('$lnAF9IosAECTnlv9p2e18FG8rHn-JgYKHEHIh5qd999', 'm.room.message', 'm.text', '1106366167788044451', 0, 0, 1),
('$Ijf1MFCD39ktrNHxrA-i2aKoRWNYdAV2ZXYQeiZI999', 'm.room.message', 'm.image', '1106366167788044451', 0, 0, 1),
('$f9cjKiacXI9qPF_nUAckzbiKnJEi0LM399kOkhdd999', 'm.sticker', NULL, '1106366167788044451', 0, 0, 1),
('$lnAF9IosAECTnlv9p2e18FG8rHn-JgYKHEHIh5qd111', 'm.room.message', 'm.text', '1106366167788044452', 1, 1, 1),
('$Ijf1MFCD39ktrNHxrA-i2aKoRWNYdAV2ZXYQeiZI111', 'm.room.message', 'm.image', '1106366167788044452', 1, 1, 1),
('$f9cjKiacXI9qPF_nUAckzbiKnJEi0LM399kOkhdd111', 'm.sticker', NULL, '1106366167788044452', 1, 1, 1),
('$Fxy8SMoJuTduwReVkHZ1uHif9EuvNx36Hg79cltiA04', 'm.room.message', 'm.text', '1144865310588014633', 0, 0, 1),
('$v_Gtr-bzv9IVlSLBO5DstzwmiDd-GSFaNfHX66IupV8', 'm.room.message', 'm.text', '1144874214311067708', 0, 0, 0),
('$7LIdiJCEqjcWUrpzWzS8TELOlFfBEe4ytgS7zn2lbSs', 'm.room.message', 'm.text', '1145688633186193479', 0, 0, 0),
('$7LIdiJCEqjcWUrpzWzS8TELOlFfBEe4ytgS7zn2lbSt', 'm.room.message', 'm.text', '1145688633186193480', 0, 0, 0),
('$7LIdiJCEqjcWUrpzWzS8TELOlFfBEe4ytgS7zn2lbSt', 'm.room.message', 'm.text', '1145688633186193481', 1, 0, 0),
('$nUM-ABBF8KdnvrhXwLlYAE9dgDl_tskOvvcNIBrtsVo', 'm.room.message', 'm.text', '1162005526675193909', 0, 0, 0),
('$0wEdIP8fhTq-P68xwo_gyUw-Zv0KA2aS2tfhdFSrLZc', 'm.room.message', 'm.text', '1162625810109317170', 1, 1, 1),
('$zJFjTvNn1w_YqpR4o4ISKUFisNRgZcu1KSMI_LADPVQ', 'm.room.message', 'm.notice', '1162625810109317170', 1, 0, 1),
('$dVCLyj6kxb3DaAWDtjcv2kdSny8JMMHdDhCMz8mDxVo', 'm.room.message', 'm.text', '1158842413025071135', 0, 0, 1),
('$7tJoMw1h44n2gxgLUE1T_YinGrLbK0x-TDY1z6M7GBw', 'm.room.message', 'm.text', '1197612733600895076', 0, 0, 1),
('$NB6nPgO2tfXyIwwDSF0Ga0BUrsgX1S-0Xl-jAvI8ucU', 'm.room.message', 'm.text', '1202543413652881428', 0, 0, 0),
('$OEEK-Wam2FTh6J-6kVnnJ6KnLA_lLRnLTHatKKL62-Y', 'm.room.message', 'm.image', '1207486471489986620', 0, 0, 0),
('$mPSzglkCu-6cZHbYro0RW2u5mHvbH9aXDjO5FCzosc0', 'm.room.message', 'm.text', '1210387798297682020', 0, 0, 1),
('$qmyjr-ISJtnOM5WTWLI0fT7uSlqRLgpyin2d2NCglCU', 'm.room.message', 'm.text', '1273204543739396116', 0, 0, 0),
('$W1nsDhNIojWrcQOdnOD9RaEvrz2qyZErQoNhPRs1nK4', 'm.room.message', 'm.text', '1273743950028607530', 0, 0, 0),
('$UTqiL3Zj3FC4qldxRLggN1fhygpKl8sZ7XGY5f9MNbF', 'm.room.message', 'm.text', '1278002262400176128', 0, 0, 1),
('$aLVZyiC3HlOu-prCSIaXlQl68I8leUdnPFiCwkgn6qM', 'm.room.message', 'm.text', '1278001833876525057', 0, 0, 1),
('$tBIT8mO7XTTCgIINyiAIy6M2MSoPAdJenRl_RLyYuaE', 'm.room.message', 'm.text', '1191567971970191490', 0, 0, 1),
('$51gH61p_eJc2RylOdE2lAr4-ogP7dS0WJI62lCFzBvk', 'm.room.message', 'm.text', '1339000288144658482', 0, 0, 0),
('$AfrB8hzXkDMvuoWjSZkDdFYomjInWH7jMBPkwQMN8AI', 'm.room.message', 'm.text', '1381212840957972480', 0, 1, 1),
('$43baKEhJfD-RlsFQi0LB16Zxd8yMqp0HSVL00TDQOqM', 'm.room.message', 'm.image', '1381212840957972480', 1, 0, 1),
('$7P2O_VTQNHvavX5zNJ35DV-dbJB1Ag80tGQP_JzGdhk', 'm.room.message', 'm.text', '1401760355339862066', 0, 0, 0);

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
('https://cdn.discordapp.com/attachments/112760669178241024/1197621094786531358/Ins_1960637570.mp4', 'mxc://cadence.moe/kMqLycqMURhVpwleWkmASpnU'),
('https://cdn.discordapp.com/attachments/1099031887500034088/1112476845502365786/voice-message.ogg', 'mxc://cadence.moe/MRRPDggXQMYkrUjTpxQbmcxB'),
('https://cdn.discordapp.com/attachments/122155380120748034/1174514575220158545/the.yml', 'mxc://cadence.moe/HnQIYQmmlIKwOQsbFsIGpzPP'),
('https://cdn.discordapp.com/attachments/112760669178241024/1296237494987133070/100km.gif', 'mxc://cadence.moe/qDAotmebTfEIfsAIVCEZptLh');

INSERT INTO emoji (emoji_id, name, animated, mxc_url) VALUES
('230201364309868544', 'hippo', 0, 'mxc://cadence.moe/qWmbXeRspZRLPcjseyLmeyXC'),
('393635038903926784', 'hipposcope', 1, 'mxc://cadence.moe/WbYqNlACRuicynBfdnPYtmvc'),
('457898385297815911', 'emoji_from_unreachable_server', 0, 'mxc://cadence.moe/bZFuuUSEebJYXUMSxuuSuLTa'),
('362741439211503616', 'bn_re', 0, 'mxc://cadence.moe/OIpqpfxTnHKokcsYqDusxkBT'),
('551636841284108289', 'ae_botrac4r', 0, 'mxc://cadence.moe/skqfuItqxNmBYekzmVKyoLzs'),
('975572106295259148', 'brillillillilliant_move', 0, 'mxc://cadence.moe/scfRIDOGKWFDEBjVXocWYQHik'),
('606664341298872324', 'online', 0, 'mxc://cadence.moe/LCEqjStXCxvRQccEkuslXEyZ'),
('288858540888686602', 'upstinky', 0, 'mxc://cadence.moe/mwZaCtRGAQQyOItagDeCocEO');

INSERT INTO member_cache (room_id, mxid, displayname, avatar_url, power_level) VALUES
('!jjmvBegULiLucuWEHU:cadence.moe', '@cadence:cadence.moe', 'cadence [they]', NULL, 50),
('!kLRqKKUQXcibIMtOpl:cadence.moe', '@cadence:cadence.moe', 'cadence [they]', NULL, 0),
('!kLRqKKUQXcibIMtOpl:cadence.moe', '@test_auto_invite:example.org', NULL, NULL, 0),
('!fGgIymcYWOqjbSRUdV:cadence.moe', '@cadence:cadence.moe', 'cadence [they]', 'mxc://cadence.moe/azCAhThKTojXSZJRoWwZmhvU', 0),
('!fGgIymcYWOqjbSRUdV:cadence.moe', '@rnl:cadence.moe', 'RNL', NULL, 0),
('!BnKuBPCvyfOkhcUjEu:cadence.moe', '@cadence:cadence.moe', 'cadence [they]', 'mxc://cadence.moe/azCAhThKTojXSZJRoWwZmhvU', 0),
('!BnKuBPCvyfOkhcUjEu:cadence.moe', '@ami:the-apothecary.club', 'Ami (she/her)', NULL, 0),
('!CzvdIdUQXgUjDVKxeU:cadence.moe', '@cadence:cadence.moe', 'cadence [they]', 'mxc://cadence.moe/azCAhThKTojXSZJRoWwZmhvU', 0),
('!TqlyQmifxGUggEmdBN:cadence.moe', '@Milan:tchncs.de', 'Milan', NULL, 0),
('!TqlyQmifxGUggEmdBN:cadence.moe', '@ampflower:matrix.org', 'Ampflower 🌺', 'mxc://cadence.moe/PRfhXYBTOalvgQYtmCLeUXko', 0),
('!TqlyQmifxGUggEmdBN:cadence.moe', '@aflower:syndicated.gay', 'Rose', 'mxc://syndicated.gay/ZkBUPXCiXTjdJvONpLJmcbKP', 0),
('!TqlyQmifxGUggEmdBN:cadence.moe', '@cadence:cadence.moe', 'cadence [they]', NULL, 0),
('!iSyXgNxQcEuXoXpsSn:pussthecat.org', '@austin:tchncs.de', 'Austin Huang', 'mxc://tchncs.de/090a2b5e07eed2f71e84edad5207221e6c8f8b8e', 0);

INSERT INTO reaction (hashed_event_id, message_id, encoded_emoji) VALUES
(5162930312280790092, '1141501302736695317', '%F0%9F%90%88');

INSERT INTO member_power (mxid, room_id, power_level) VALUES
('@test_auto_invite:example.org', '*', 100);

INSERT INTO lottie (sticker_id, mxc_url) VALUES
('860171525772279849', 'mxc://cadence.moe/ZtvvVbwMIdUZeovWVyGVFCeR');

INSERT INTO auto_emoji (name, emoji_id) VALUES
('L1', '1144820033948762203'),
('L2', '1144820084079087647');

INSERT INTO media_proxy (permitted_hash) VALUES
(-429802515645771439),
(4558604729745184757);

INSERT INTO invite (mxid, room_id, type, name, avatar, topic) VALUES
('@cadence:cadence.moe', '!zTMspHVUBhFLLSdmnS:cadence.moe', 'm.space', 'Data Horde', 'mxc://cadence.moe/TLqQOsTSrZkVKwBSWYTZNTrw', 'here is the space topic'),
('@cadence:cadence.moe', '!jjmvBegULiLucuWEHU:cadence.moe', 'm.space', 'Epicord', NULL, NULL),
('@cadence:cadence.moe', '!room:cadence.moe', NULL, 'some room', NULL, NULL),
('@rnl:cadence.moe', '!space:cadence.moe', NULL, 'somebody else''s space', NULL, NULL);

INSERT INTO direct (mxid, room_id) VALUES
('@user1:example.org', '!existing:cadence.moe'),
('@user2:example.org', '!existing:cadence.moe');

COMMIT;
