# User Guide

This is mostly to help bridge users, though bridge admins will likely also find it useful.

## Chatting

Send/edit/delete a message or reaction on Discord or Matrix and it will be cloned to the other side.

## Replies

Discord replies are bridged to Matrix as the native rich replies feature.

Matrix rich replies cannot be bridged as native Discord replies due to Discord limitations, so the reply layout is simulated instead, using emojis for layout and a brief preview of the replied-to message.

## Inviting Users

Discord users can use Discord invite links like normal.

Matrix users can invite other Matrix users like normal. This depends on the @everyone role having guild-level Create Instant Invite in the Discord permissions system.

Discord users can invite Matrix users with the `/invite` command. This depends on the user having guild-level Create Instant Invite in the Discord permissions system.

## Joining Rooms and Threads

If a Matrix user has been `/invite`d, they should be part of the space. They can use the space to join other rooms and threads.

If a room is newly created, it will be added to the space, but it will not be announced and Matrix users will not be auto-joined to it. They will have to seek it out themselves.

If a thread is newly created, it will be added to the space, and an announcement will also be posted to the parent channel with a link to quickly join.

Matrix users can create their own thread with `/thread <name>`. This will create a real thread channel on Discord-side and announce its creation on both sides in the usual way.

## Custom Room Icons

Normally on Matrix, the room icons will match the space icon. Since Matrix allows for room-specific icons, the bridge will keep track of any custom icon that was set on a room.

The bridge allows any member on Matrix-side to change the room icon through the usual Matrix interface. Once set, this custom icon will not be overwritten by the guild icon.

Discord users can see the custom icon and change it using the `/icon` command, but it won't be displayed to them passively in the interface.

## Spoilers

Text spoilers are bridged in both directions using the native features on each platform. If a spoiler is revealed for you without you interacting with it, this is a bug in your Matrix client.

Matrix currently lacks full support for media spoilers. Any media spoilers coming from Discord will be changed into a link on Matrix side. I hope your client doesn't generate a URL preview!

The bridge will endeavour to hide spoilers anywhere they might be copied, such as in the Matrix->Discord reply previews.

## Managing Emojis

Discord's list of emojis and stickers will be bridged to Matrix, but not the other direction. Changes to the "Discord Emojis" pack on Matrix-side will be overwritten. (Other packs originating from Matrix-side won't be overwritten.)

## Using Emojis

Emojis should intuitively "work" in virtually all cases. Here's a detailed breakdown:

### Discord->Matrix

In messages: Emojis go in `<img>` tags for Matrix users to see. Most clients should support viewing these. Note that there is a [Synapse bug](https://github.com/matrix-org/synapse/issues/1278) where *animated* images will not appear animated when resized down to emoji size.)

In reactions: Emojis are reacted in [mxc:// key format](https://github.com/matrix-org/matrix-spec-proposals/pull/4027). Compatible clients will show them as the proper images.

### Matrix->Discord

Where|Exists on Discord?|What happens
-|:-:|-
Messages|Yes|It uses Discord's existing copy of the emoji.
Reactions|Yes|It uses Discord's existing copy of the emoji.
Messages|No|All emojis at the end of a message are converted into a 2D sprite-sheet which is bridged as a file upload. Trust me, this works better than it sounds!
Messages|No|Emojis in the middle of a message are linked. They activate Discord URL previews of what they look like. This is not amazing but it is acceptable.
Reactions|No|It doesn't work and you see an error notice.

## Using Stickers

Discord's stickers appear as stickers on Matrix. This works for all default and custom stickers. Some of Discord's default stickers might not be animated on Matrix-side because the bridge deliberately only rasterises the first frame of Lottie animations.

Matrix stickers appear as file uploads on Discord with no animation issues.

## Extra-Long Names

Discord display names for normal users are limited to 32 characters. For webhooks (Matrix users are bridged as webhooks) you get up to 80 characters. This bridge takes it a step further by shifting the rest of your name to the start of the message if you go over the limit. Name away!

## Catch-up

If the bridge software was restarted, it will attempt to catch up on messages missed while it was offline.

From Discord, for any given channel, if fewer than 50 messages were missed in that given channel, the bridge will catch up and transfer all of them to Matrix. If more than 50 messages were missed in that given channel, the bridge will only bridge the latest message. Happenings that aren't messages, such as edits and reactions to prior messages, might be missed during catch-up.

From Matrix, all events should be bridged to Discord.

## Errors

If a problem occurs while bridging data in either direction, an error notice will be logged. The log will always appear on Matrix-side in the same room. The error notice includes the error message, stack trace, and the data that caused the problem.

If you suspect the error was an intermittent issue, such as Discord being offline, you can react with 🔁 on the error notice to ask the bridge to try again. If it still didn't work, you'll see another error message.

If the error is rooted in some deeper issue with the bridge's code, please report this issue. Once the issue is fixed and the bridge is updated, you can react on the error notice 🔁 to try again.
