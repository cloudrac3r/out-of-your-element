# Private messages

## Invite flow (m->d)

1. Matrix user invites OOYE sim to chat
2. OOYE verifies that they share a room that they've both(?) spoken in (by member cache).
	- If so, says "enter a message and it will send the user a message request"
	- If not, says "you have to share a room first, or the discord user has to start chat"
3. Wait for first message from Matrix user
	- Continue accepting further messages from Matrix user but put them in backlog
		- Backlog is just stored in the room on Matrix. Use an event ID to point into it (?)
4. Announce to Discord user that they have a message request
5. Discord user acts on message request
	- Allowed: Add Matrix user to allow-list and unspool backlog
	- Denied: Add Matrix to deny-list and dismiss message request

## Invite flow (d->m)

1. Discord user invites Matrix user to chat (e.g. with /dm command)
2. OOYE informs Discord user that the Matrix user has been invited and messages will show up here
3. Add Matrix user to allow-list (clear deny-list if applicable)
4. Send the message to the Matrix user

## Unspool backlog

1. If not the most recent chatter (store in database), post user's card image, use components or something to stand out
2. Use pagination API to start at marked event and send subsequent events in order

## Database structures

- Allow-list pairing a Discord user and Matrix user
- Deny-list pairing a Discord user and Matrix user
- Conversation location pairing a Discord user and Matrix user with a room ID and a DM channel ID
- Backlog pairing a Discord user and Matrix user with a timeline event in the Matrix room

```
BEGIN TRANSACTION;

CREATE TABLE "pm" (
	"user_id"	TEXT NOT NULL,
	"mxid"	TEXT NOT NULL,
	"status"	INTEGER NOT NULL,
	"channel_id"	TEXT NOT NULL,
	"room_id"	TEXT NOT NULL,
	"spool_event"	TEXT,
	PRIMARY KEY("user_id","mxid")
) WITHOUT ROWID;

COMMIT;
```

### Statuses

- pending
- allowed
- denied
- 

## What hell am I putting the database through

Ideally I would like to be able to reuse all existing code that handles looking up existing messages: reactions, polls, editing, deleting, all that. It should be abstract enough to work in either DM channels or guild channels.

So what database structures does that rely on?

- `event_message`
	- `message_room`
		- `historical_channel_room`
			- `channel_room` 
				- `guild_active` (does not require `guild_space`)

Much of this makes sense - it would be good to be able to seamlessly upgrade DM rooms for example - but I have to break the link at either `channel_room` or `guild_active`.

The `channel_room` table is a convenient place to look up the link. However, it also includes concerns (like the name and speedbump) that are not applicable to DMs. Also, its `channel_id` is the primary key, but on Discord, multiple Matrix user DMs will be in the same DM channel ID, so this primary key either needs to be changed or fabricated keys need to be used, neither of which seems pretty.

So I'm leaning towards not using `channel_room` for DM channels, but the other option is using it and disconnecting it from `guild_active`.

I'm also concerned about whether it's a problem for multiple _active_ rooms in `historical_channel_room` to share a `reference_channel_id`, because isn't that used to specify whether the rooms are part of the same history?

## Brainwave while out walking (not sure if it's correct yet)

I think I figured out the data structures for doing dms on the bridge!
the trick is to not store room_id in channel_room (just make it nullable) and to rely on historical_channel_room for pairing everyone simultaneously
so when I get home if I have dopamine I'll look into how much it would hurt if that column was nullable
and how much it would hurt if historical_channel_room could hold multiple active rooms
if all that seems possible then I'll run a schema change at the same time to move speedbump associations to another table

## Outstanding issues

- What do we do if the Matrix user leaves the room but wants to continue the conversation later?
