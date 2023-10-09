# d2m

## Known issues

- m->d code blocks have slightly too much spacing
- rooms will be set up even if the bridge does not have permission for the channels, which breaks when it restarts and tries to fetch messages
	- test private threads as part of this
	- solution part 1: calculate the permissions to see if the bot should be able to do stuff
	- solution part 2: attempt a get messages request anyway before bridging a new room, just to make sure!
	- solution part 3: revisit the permissions to add newly available rooms and to close newly inaccessible rooms
- consider a way to jump to a timestamp by making up a discord snowflake. practical? helpful?
- pluralkit considerations for artemis
- consider whether to use nested spaces for channel categories and threads

## Mapping

Remember that a discord message may be transformed to multiple matrix messages.

A database will be used to store the discord id to matrix event id mapping. Table columns:
- discord id
- matrix id
- the "type" of the matrix id, used to update things properly next time. for example, whether it is the message text or an attachment. alternatively, whether it is a primary or supporting event for the discord message, primary being message content and supporting being embeds or attachments or etc.

There needs to be a way to easily manually trigger something later. For example, it should be easy to manually retry sending a message, or check all members for changes, etc.

## Current manual process for setting up a server

1. Call createSpace.createSpace(discord.guilds.get(GUILD_ID))
2. Call createRoom.createAllForGuild(GUILD_ID) // TODO: Only create rooms that the bridge bot has read permissions in!
3. Edit source code of event-dispatcher.js isGuildAllowed() and add the guild ID to the list
4. If developing, make sure SSH port forward is activated, then wait for events to sync over!

## Transforming content

1. Upload attachments to mxc if they are small enough.
2. Convert discord message text and embeds to matrix event.
	1. Convert discord mentions, names, channel links, message links, and emojis to intermediate formats.
	2. Convert discord text to body.
	3. Convert discord text to formatted_body using custom discord-markdown npm module.
	4. Convert discord embeds to quotes.
3. Gather relevant reply data.
4. Send reply+message.
5. Send attachments.
6. Store in database.

## Discord's permissions in spaces

### The space itself

Discord guilds are invite only, so the corresponding **space** should initially be set to:

- Find & join access: Invite only
- Preview space: Yes

Public channels in that server should then use the following settings, so that they can be opened by anyone who was successfully invited to the space:

- Find & join access: Space members (so users must have been invited to the space already, even if they find out the room ID to join)
- Who can read history: Anyone (so that people can see messages during the preview before joining)

Step by step process:

1. Create a space room for the guild. Store the guild-space ID relationship in the database. Configure the space room to act like a space.
	- `{"name":"NAME","preset":"private_chat","visibility":"private","power_level_content_override":{"events_default":100,"invite":50},"topic":"TOPIC","creation_content":{"type":"m.space"},"initial_state":[{"type":"m.room.guest_access","state_key":"","content":{"guest_access":"can_join"}},{"type":"m.room.history_visibility","content":{"history_visibility":"invited"}}]}`
2. Create channel rooms for the channels. Store the channel-room ID relationship in the database. (Probably no need to store parent-child relationships in the database?)
3. Send state events to put the channel rooms in the space.

### Private channels

Discord **channels** that disallow view permission to @everyone should instead have the following **room** settings in Matrix:

- Find & join access: Private (so space members cannot join without an additional invitation)
- Who can read history: Anyone (XXX: is this safe??? is this a fishbowl situation? https://github.com/matrix-org/synapse/issues/9202)

### Discord experience: /invite command

The context-sensitive /invite command will invite Matrix users to the corresponding spaces or rooms.

- In a **public channel** (i.e. @everyone is allowed access), /invite will invite an MXID to the **space**, provided the user has Create Invites.
- In a **private channel**, /invite will invite a distinct username or MXID to the **room**, provided the user has Manage Server.
- In a **public or private thread**, /invite will invite a distinct username or MXID to the **thread room**.

# d2m events

## Login - backfill

Need to backfill any messages that were missed while offline.

After logging in, check last_message_id on each channel and compare against database to see if anything has been missed. However, mustn't interpret old channels from before the bridge was created as being "new". So, something has been missed if:

- The last_message_id is not in the table of bridged messages
- The channel is already set up with a bridged room
- A message has been bridged in that channel before

(If either of the last two conditions is false, that means the channel predates the bridge and we haven't actually missed anything there.)

For channels that have missed messages, use the getChannelMessages function, and bridge each in turn.

Can use custom transaction ID (?) to send the original timestamps to Matrix. See appservice docs for details.

## Message sent

1. Transform content.
2. Send to matrix.

## Webhook message sent

- Consider using the _ooye_bot account to send all webhook messages to prevent extraneous joins?
	- Downside: the profile information from the most recently sent message would stick around in the member list. This is tolerable.
- Otherwise, could use an account per webhook ID, but if webhook IDs are often deleted and re-created, this could still end up leaving too many accounts in the room.
- The original bridge uses an account per webhook display name, which makes the most sense in terms of canonical accounts, but leaves too many accounts in the room.

## Message deleted

1. Look up equivalents on matrix.
2. Delete on matrix.

## Message edited / embeds added

1. Look up equivalents on matrix.
2. Transform content.
3. Build replacement event with fallbacks.
4. Send to matrix.

## Reaction added/removed/emoji removed/all removed

m->d reactions will have to be sent as the bridge bot since webhooks cannot add reactions. This also means Discord users can't tell who reacted. We will have to tolerate this.

Database storage requirements for each kind of event:

**Added**

N/A

**Removed d->m**

Need to know the event ID of the reaction event so we can redact it. We can look it up with `/v1/rooms/!x/relations/$x/m.annotation`. (If the message was edited, use its original event ID in the query.) This gets all event details for all reactions from the homeserver.

If it is a custom emoji, we will need to use the existing `emoji` table to resolve the emoji ID to the key.

Then we can pick the one to redact based on the `key` and `sender` and redact it.

This also works for _remove emoji_ and _remove all_.

**Removed m->d**

Need to know the discord ID of the message that was reacted to. If we know the event ID of what was reacted to, we can look up the Discord ID in the usual database. Unfortunately, after a reaction has been redacted, it's already too late to look up which event it was redacted from.

So we do need a database table. It will only hold reactions that were sent by Matrix users and were successfully bridged. It will associate the reaction event ID with the Discord message ID it was reacted on (skipping the middleman).

## Member data changed

1. Compare current member against cached version in database.
2. Update member on matrix.
3. Update cached version in database.

## Channel created / updated

(but I should be able to manually call this function at any time to run the same code on any given channel)

1. Compare current channel against cached version in database.
2. If channel does not yet exist in database:
	1. Create the corresponding room.
	2. Add to database.
3. Update room details to match.
4. Make sure the permissions are correct according to the rules above!
5. Add to space.

## Emojis updated

1. Upload any newly added images to msc.
2. Create or replace state event for the bridged pack. (Can just use key "ooye" and display name "Discord", or something, for this pack.)
3. The emojis may now be sent by Matrix users!

```
pragma case_sensitive_like = 1;
insert into emoji select replace(substr(discord_url, 35), ".gif", "") as id, 1 as animated, mxc_url from file where discord_url like 'https://cdn.discordapp.com/emojis/%.gif';
insert into emoji select replace(substr(discord_url, 35), ".png", "") as id, 0 as animated, mxc_url from file where discord_url like 'https://cdn.discordapp.com/emojis/%.png';
```

# Various considerations

## Issues if the bridge database is rolled back

### channel_room table

- Duplicate rooms will be created on matrix.

### sim table

- Sims will already be registered, registration will fail, all events from those sims will fail.

### guild_space table

- channelToKState will fail, so channel data differences won't be calculated, so channel/thread creation and sync will fail.

### event_message table

- Events referenced by other events will be dropped, for example
	- edits will be ignored
	- deletes will be ignored
	- reactions will be ignored
	- replies won't generate a reply

### file

- Some files like avatars may be re-uploaded to the matrix content repository, secretly taking more storage space on the server.

### webhook

- Some duplicate webhooks may be created.

### sim_member table

- Some sims will try to re-join the room, which is slow the first time.

## Creating and notifying about new threads:

Discord's gateway events when a thread is created off a message:

1. Regular MESSAGE_CREATE of the message that it's going to branch off in the future. Example ID -6423
2. It MESSAGE_UPDATEd the ID -6423 with this whole data: {id:-6423,flags: 32,channel_id:-2084,guild_id:-1727} (ID is the message ID it's branching off, channel ID is the parent channel containing the message ID it's branching off)
3. It THREAD_CREATEd and gave us a channel object with type 11 (public thread) and parent ID -2084 and ID -6423.
4. It MESSAGE_CREATEd type 21 with blank content and a message reference pointing towards channel -2084 message -6423. (That's the message it branched from in the parent channel.) This MESSAGE_CREATE got ID -4631 (a new ID). Apart from that it's a regular message object.
5. Finally, as the first "real" message in that thread (which a user must send to create that thread!) it sent a regular message object with a new message ID and a channel ID of -6423.

When viewing this thread, it shows the message branched from at the top, and then the first "real" message right underneath, as separate groups.

### Problem 1

If THREAD_CREATE creates the matrix room, this will still be in-flight when MESSAGE_CREATE ensures the room exists and creates a room too. There will be two rooms created and the bridge falls over.

#### Possible solution: Ignore THREAD_CREATE

Then the room will be implicitly created by the two MESSAGE_CREATEs, which are in series.

#### Possible solution: Store in-flight room creations - ✔️ this solution is implemented

Then the room will definitely only be created once, and we can still handle both events if we want to do special things for THREAD_CREATE.

#### Possible solution: Don't implicitly create rooms

But then old and current threads would never have their messages bridged unless I manually intervene. Don't like that.

### Problem 2

MESSAGE_UPDATE with flags=32 is telling that message to become an announcement of the new thread's creation, but this happens before THREAD_CREATE. The matrix room won't actually exist when we see MESSAGE_UPDATE, therefore we cannot make the MESSAGE_UPDATE link to the new thread.

#### Possible solution: Ignore MESSAGE_UPDATE and bridge THREAD_CREATE as the announcement - ✔️ this solution is implemented

When seeing THREAD_CREATE (if we use solution B above) we could react to it by creating the thread announcement message in the parent channel. This is possible because THREAD_CREATE gives a thread object and that includes the parent channel ID to send the announcement message to.

While the thread announcement message could look more like Discord-side by being an edit of the message it branched off:

> look at my cat
>
> Thread started: [#cat thread]

if the thread branched off a matrix user's message then the bridge wouldn't be able to edit it, so this wouldn't work.

Regardless, it would make the most sense to post a new message like this to the parent room:

> > Reply to: look at my cat
>
> [me] started a new thread: [#cat thread]
