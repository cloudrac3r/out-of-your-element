BEGIN TRANSACTION;

DELETE FROM member_cache
WHERE room_id NOT IN (SELECT room_id FROM channel_room)
	AND room_id NOT IN (SELECT space_id FROM guild_space)
	AND room_id NOT IN (SELECT room_id FROM historical_channel_room)
	AND room_id NOT IN (SELECT room_id FROM invite);

COMMIT;
