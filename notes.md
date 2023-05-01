# d2m

Remember that a discord message may be transformed to multiple matrix messages.

A database will be used to store the discord id to matrix event id mapping. Table columns:
- discord id
- matrix id
- the "type" of the matrix id, used to update things properly next time. for example, whether it is the message text or an attachment. alternatively, whether it is a primary or supporting event for the discord message, primary being message content and supporting being embeds or attachments or etc.

There needs to be a way to easily manually trigger something later. For example, it should be easy to manually retry sending a message, or check all members for changes, etc.

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

## Message sent

1. Transform content.
2. Send to matrix.

## Message deleted

1. Look up equivalents on matrix.
2. Delete on matrix.

## Message edited / embeds added

1. Look up equivalents on matrix.
2. Replace content on matrix.

## Reaction added

1. Add reaction on matrix.

## Reaction removed

1. Remove reaction on matrix.

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
4. Add to space.
