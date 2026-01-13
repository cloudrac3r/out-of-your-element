# Room upgrades

"Upgrading" a room is supposed to create a new room and then tries to set it up exactly like the old one. So it copies name, topic, power levels, space membership, etc. The old room is marked as old with an `m.room.tombstone` event, its power levels are adjusted to make it harder to send messages, and a hyperlink to the new room is added.

## What happens?

A room upgrade is triggered by a POST request to `/_matrix/client/v3/rooms/{roomId}/upgrade`. The upgrade process is done by the server, and involves multiple events across multiple rooms. Since this is server-specific, what will _actually_ happen depends on the server's implementation, but the spec says it does this:

1. Checks that the user has permission to send `m.room.tombstone` events in the room.
2. Creates a replacement room with a `m.room.create` event containing a predecessor field, the applicable `room_version`, and a `type` field which is copied from the predecessor room. If no `type` is set on the previous room, no `type` is specified on the new room’s create event either.
3. Replicates transferable state events to the new room. The exact details for what is transferred is left as an implementation detail, however the recommended state events to transfer are:
	* `m.room.server_acl`
	* `m.room.encryption`
	* `m.room.name`
	* `m.room.avatar`
	* `m.room.topic`
	* `m.room.guest_access`
	* `m.room.history_visibility`
	* `m.room.join_rules`
	* `m.room.power_levels`

	(Membership can't be transferred by the server.)

4. Moves any local aliases to the new room.
5. Sends a `m.room.tombstone` event to the old room to indicate that it is not intended to be used any further.
6. If possible, the power levels in the old room should also be modified to prevent sending of events and inviting new users. For example, setting `events_default` and `invite` to the greater of `50` and `users_default + 1`.

### Synapse additionally:

1. Copies its `m.space.child` events (if it was a space).
	* This is good for OOYE, because it automatically tries to join new rooms when they're added to a registered space.
2. Copies bans.
3. Un/publishes to the public room directory as applicable.
4. Copies user tags and push rules.

Conduwuit does not do those!

### Element additionally:

1. May invite all users from the old room to the new room, depending on if the checkbox is checked in the dialog.
2. Update parent spaces to remove the old room and add the new room.

Cinny does not do those! The new room is totally detached! The hyperlink from the old room (and the moved alias by server) is the only way to find it!

* This is probably still okay for OOYE? Since the join rules are preserved, and if they were `restricted`, OOYE is able to join via the tombstone hyperlink. Then, after it joins, it's already PL 100 since the power levels are preserved. It's very bad if the join rules were `invite`, but OOYE never sets this join rule - it's either `restricted` or `public`.

### Other clients

Nheko doesn't support room upgrades at all. Cinyy, NeoChat and FluffyChat just call the API and don't do anything. FluffyChat invites all joined/invited users to the new room if the join rule is restricted.

### Notable things that don't happen at all:

* Add `m.space.parent` pointing to the space it was in (if it was a room in a space).

## What should OOYE do?

### Ideal case (Element, Synapse)

The new room is added to the space and OOYE autojoins it. It already has the correct power levels and join rules.

OOYE still needs to do this:

1. Un/set `m.room.parent` in the rooms.
2. Update `channel_room` and `historical_channel_room` tables.

### Not ideal case (everyone else)

OOYE should:

1. Join the room by following the hyperlink from the tombstone, if able
	* If not able, somebody messed with the join rules. Send a PM to the user who upgraded - the new room's creator - asking for an invite.
2. Wait for join.
3. Un/set `m.space.child` events on the space.
4. Un/set `m.room.parent` in the rooms.
5. Update `channel_room` and `historical_channel_room` tables.
6. Un/publish to the room directory.

### It's actually fine to do all the steps always

Even by blindly following the entire list, each step is a no-op or atomic, so it doesn't matter if Element is also trying to do them.
