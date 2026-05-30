BEGIN TRANSACTION;

DELETE FROM emoji WHERE mxc_url NOT IN (SELECT mxc_url FROM file WHERE discord_url LIKE 'https://cdn.discordapp.com/emojis/%.webp%');

COMMIT;
