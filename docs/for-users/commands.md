# Commands

## For Discord users

### `/invite`

Invite a Matrix user to this Discord server.

On Matrix, people can choose which channels they want to join. If you use the command a second time, you can additionally invite them to the specific channel.

### `/ping`

Notify a Matrix user.

You can do this without the command just by typing `@their username`. It won't look like anything to you, but it works on the other side! You only need to use `/ping` if you really want to be sure.

### Right click -> `Matrix info`

See details about who sent a message.

### Right click -> `Responses`

See the specific users who reacted to a message or voted on a poll.

## For Discord moderators

### `/privacy`

Set how public or private the Matrix rooms are.

### Right click -> `Permissions`

Give Matrix users additional permissions:

- `Default`
- `Moderator` - can delete messages, kick or ban
- `Admin` - can moderate moderators and break the room

## For Matrix users

### `/thread`

Create a new bridged Discord thread. You must write a `name` for the thread after the command.

This is necessary since standard Matrix threads are not bridged as Discord threads, they appear as reply chains on Discord instead.

### `/invite`

Create a Discord invite link. You can use this to invite people who only use Discord.

### `/time`

Similar to Discord's @time feature. Set your time zone in your client, then write a `human-readable time` after the command, and it'll be converted to everyone else's local time.

## For Matrix moderators

### `/emoji`

For clients that don't support editing emojis natively, add a new emoji to the bridged Discord server.

Use this while replying to an image that you want to add as an emoji. You can set a custom name by writing `:name:` after the command.
