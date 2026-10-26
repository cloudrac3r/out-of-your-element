# Privileged intents

## Overview of application process

After your Discord bot has access to more than 10,000 users (total across all guilds it's in), you'll receive a message from Discord staff telling you to complete the privileged intents application.

You have to write a form explaining to Discord what you need the privileged intents for, and they'll manually approve or reject your application. Try to sound helpful!

You have to re-apply every year (you'll receive another message when it's time). It's worth saving a copy of what you submit so that you can paste the same thing again next year.

If you don't do the application process, your Out Of Your Element bot won't work any more.

## Which intents

The Message Content intent is **required** for reading what Discord users are saying. OOYE can't function without it, so you at least need to apply for this one.

The Server Members intent is **optional**. It's used to tell when Discord users leave or are kicked from the guild, and OOYE uses that to remove their sims from Matrix-side. Without this intent, Discord users will be stuck in the Matrix user list even if they've left the guild, and people might try to `@mention` users that aren't around any more.

The Presence Intent is **optional**. It's used to show Discord user online/away/offline statuses on Matrix-side.

Applications that requested **all 3 privileged intents** have been successful, so I suggest you may as well apply for all 3 them.

## Writing your application

This [application by Amber of kathund.dev](https://bridge.cadence.moe/download/matrix/snowball.kathund.dev/kDSCaRYXXrXpfZQiifZDnhNW) for only Message Content and Server Members was successful. You may wish to take notes from it when writing your own application, though I suggest _not_ copying it word for word.

I recorded a video demonstrating the Guild Members intent, you can use this: https://youtu.be/i9_sx0fYQWs

I also recorded a video demonstrating the Message Content intent, you can use this too: https://youtu.be/LsPho8gtGRw

## Difference between privileged intents and verification

The privileged intents application process does not require sending personally identifiable information.

In contrast, verification requires submitting [real world ID](https://support-dev.discord.com/hc/en-us/articles/6226051178775-Stripe-Identity-Verification-FAQ). I think Discord's doing this because they don't want to be host to the next set of massive scale privacy violations, like [Cambridge Analytica](https://greatermanchester.ac.uk/blogs/the-cambridge-analytica-scandal-and-what-it-teaches-us) or [Clearview AI](https://www.cnet.com/news/privacy/clearview-ai-hit-with-cease-and-desist-from-google-over-facial-recognition-collection/). I believe they collect real-world ID in order to scare away possible perpetrators, or to sue them if they do. Though who knows if they'll use the IDs for anything else.

You need to do the verification process to join the Discord bot to more than 100 Discord guilds.
