## What is PluralKit

PluralKit is a Discord bot. After a Discord user registers with PK, PK will delete and repost their messages. The reposted messages will be sent by a webhook with a custom display name and avatar. This effectively lets a person assume a custom display name and avatar at will on a per-message basis. People use this for roleplaying and/or dissociative-identity-disorder things. PK is extremely popular.

## PK terminology

- **Proxying:** The act of deleting and reposting messages.
- **Member:** Identity that messages will be posted by.
- **System:** Systems contain members. A system is usually controlled by one Discord account, but it's also possible to have multiple accounts be part of the same system.

## PK API schema

https://pluralkit.me/api/models/

## Experience on OOYE without special PK handling

1. Message is sent by Discord user and copied to Matrix-side.
1. The message is immediately deleted by PK and deleted from Matrix-side.
1. The message is resent by the PK webhook and copied to Matrix-side (by @_ooye_bot) with limited authorship information.

## Experience on Half-Shot's bridge without special PK handling

1. Message is sent by Discord user and copied to Matrix-side.
1. The message is immediately deleted by PK and deleted from Matrix-side.
1. The message is resent by the PK webhook and copied to Matrix-side _by a dedicated sim user for that webhook's username._

If a PK system member changes their display name, the webhook display name will change too. But Half-Shot's bridge can't keep track of webhook message authorship. It uses the webhook's display name to determine whether to reuse the previous sim user account. This makes Half-Shot's bridge create a brand new sim user for the same system member, and causes the Matrix-side member list to eventually fill up with lots of abandoned sim users named @_discord_NUMBERS_NUMBERS_GARBLED_NAME.

## Goals of special PK handling

1. Avoid bridging the send-delete-send dance (solution: the speedbump)
2. Attribute message authorship to the actual PK system member (solution: system member mapping)
3. Avoid creating too many sim users (solution: OOYE sending other webhook messages as @_ooye_bot)

## What is the speedbump (goal 1)

When a Discord user sends a message, we can't know whether or not it's about to be deleted by PK.

If PK doesn't plan to delete the message, we should deliver it straight away to Matrix-side.

But if PK does plan to delete the message, we shouldn't bridge it at all. We should wait until the PK webhook sends the replacement message, then deliver _that_ message to Matrix-side.

Unfortunately, we can't see into the future. We don't know if PK will delete the message or not.

My solution is the speedbump. In speedbump-enabled channels, OOYE will wait a few seconds before delivering the message. The **purpose of the speedbump is to avoid the send-delete-send dance** by not bridging a message until we know it's supposed to stay.

## Configuring the speedbump

Nuh-uh. Offering configuration creates an opportunity for misconfiguration. OOYE wants to act in the best possible way with the default settings. In general, everything in OOYE should work in an intelligent, predictable way without having to think about it.

Since it slows down messages, the speedbump has a negative impact on user experience if it's not needed. So OOYE will automatically activate and deactivate the speedbump if it's necessary. Here's how it works.

When a message is deleted in a channel, the following logic is triggered:

1. Discord API: Get the list of webhooks in this channel.
1. If there is a webhook owned by PK, speedbump mode is now ON. Otherwise, speedbump mode is now OFF.

This check is only done every so often to avoid encountering the Discord API's rate limits.

## PK system member mapping (goal 2)

PK system members need to be mapped to individual Matrix sim users, so we need to map the member data to all the fields of a Matrix profile. (This will replace the existing logic of `userToSimName`.) I'll map them in this way:

- **Matrix ID:** `@_ooye_pk_[FIVE_CHAR_ID].example.org`
- **Display name:** `[NAME] [[PRONOUNS]]`
- **Avatar:** webhook_avatar_url ?? avatar_url

I'll get this data by calling the PK API for each message: https://api.pluralkit.me/v2/messages/[PK_WEBHOOK_MESSAGE_ID]

## Special code paths for PK users

TBD

## Database schema

TBD

## Unsolved problems

- How does message editing work?
- Improve the contents of PK's reply embeds to be the actual reply text, not the OOYE context preamble
- Unused or removed system members should be removed from the member list too.
- When a Discord user leaves a server, all their system members should leave the member list too. (I also have to solve this for regular non-PK users.)
