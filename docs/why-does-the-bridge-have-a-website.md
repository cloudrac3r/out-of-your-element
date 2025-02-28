# Why does the bridge have a website?

## It's essential for making images work

Matrix has a feature called [Authenticated Media](https://matrix.org/blog/2024/06/26/sunsetting-unauthenticated-media/), where uploaded media (like user avatars and uploaded files) is restricted to Matrix users only. This means Discord users wouldn't be able to see important parts of the conversation.

To keep things working for Discord users, OOYE's web server can act as a proxy files that were uploaded on Matrix-side. This will automatically take effect when needed, so Discord users shouldn't notice any issues.

## Why now?

I knew a web interface had a lot of potential, but I was reluctant to add one because it would make the initial setup more complicated. However, when authenticated media forced my hand, I saw an opportunity to introduce new useful features. Hopefully you'll agree that it's worth it!

# What else does it do?

## Makes it easy to invite the bot

The home page of the website has buttons to add the bridge bot to a Discord server. If you are primarly a Matrix user and you want somebody else (who may be less technical) to add the bot to their own Discord server, this should make it a lot more intuitive for them.

## Makes it easy to invite yourself or others

After your hypothetical less-technical friend adds the bot to their Discord server, you need to generate an invite for your Matrix account on Matrix-side. Without the website, you might need to guide them through running a /invite command with your user ID. With the website, they don't have to do anything extra. You can use your phone to scan the QR code on their screen, which lets you invite your user ID in your own time.

You can also set the person's permissions when you invite them, so you can easily bootstrap the Matrix side with your trusted ones as moderators.

## To link channels and rooms

Without a website, to link Discord channels to existing Matrix rooms, you'd need to run a /link command with the internal IDs of each room. This is tedious and error-prone, especially if you want to set up a lot of channels. With the web interface, you can see a list of all the available rooms and click them to link them together.

## To change settings

Important settings, like whether the Matrix rooms should be private or publicly accessible, can be configured by clicking buttons rather than memorising commands. Changes take effect immediately.

# Permissions

## Bot invites

Anybody who can access the home page can use the buttons to add your bot - but even without the website, they can already do this by manually constructing a URL. If you want to make it so _only you_ can add your bot to servers, you need to edit [your Discord application](https://discord.com/developers/applications), go to the Bot section, and turn off the switch that says Public Bot.

## Server settings

If you have either the Administrator or Manage Server permissions in a Discord server, you can use the website to manage that server, including linking channels and changing settings.

# Initial setup

The website is built in to OOYE and is always running as part of the bridge. For authenticated media proxy to work, you'll need to make the web server accessible on the public internet over HTTPS, presumably using a reverse proxy.

When you use `npm run setup` as part of OOYE's initial setup, it will guide you through this process, and it will do a thorough self-test to make sure it's configured correctly. If you get stuck or want a configuration template, check the notes below.

## Reverse proxy

When OOYE is running, the web server runs on port 6693. (To use a different port or a UNIX socket, edit registration.yaml's `socket` setting and restart.)

It doesn't have to have its own dedicated domain name, you can also use a sub-path on an existing domain, like the domain of your Matrix homeserver. You are likely already using a reverse proxy to run your homeserver, so this should just be a configuration change.

[See here for sample configurations!](https://gitdab.com/cadence/out-of-your-element/src/branch/main/docs/get-started.md#appendix)
