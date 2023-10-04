BEGIN TRANSACTION;

-- Rename mxc to mxc_url for consistency

ALTER TABLE lottie RENAME COLUMN mxc TO mxc_url;

-- Rename id to sticker_id so joins make sense in the future

ALTER TABLE lottie RENAME COLUMN id TO sticker_id;

-- Rename discord_id to user_id so joins make sense in the future

ALTER TABLE sim RENAME COLUMN discord_id TO user_id;

COMMIT;
