# Out Of Your Element

Modern Matrix-to-Discord appservice bridge.

## Why a new bridge?

* Modern: Supports new Discord features like replies, threads and stickers, and new Matrix features like edits, spaces and space membership.
* Reliable: Any errors on either side are notified on Matrix and can be retried.
* Tested: A test suite and code coverage make sure all the core logic works.
* Simple development: No build step (it's JavaScript, not TypeScript), minimal/lightweight dependencies, and abstraction only where necessary so that less background knowledge is required. No need to learn about Intents or library functions.

## What works?

Most features you'd expect in both directions, plus a little extra spice:

* Messages
* Edits
* Deletions
* Text formatting, including spoilers
* Reactions
* Mentions
* Replies
* Threads
* Stickers (all formats: PNG, APNG, GIF, and Lottie)
* Attachments
* Spoiler attachments
* Guild-Space details syncing
* Channel-Room details syncing
* Custom room names/avatars can be applied on Matrix-side
* Larger files from Discord are linked instead of reuploaded to Matrix

## Caveats

* Custom emojis don't fully work yet.
* Embeds don't work yet.
* This bridge is not designed for puppetting.
* Some aspects of this bridge are customised for my homeserver. I'm working over time to make it more general. Please please reach out to @cadence:cadence.moe if you would like to run this, and I'll work with you to get it running!

# Development information

## You will need

* Discord bot
* Access to the homeserver's configuration
* (For now) Help and support from @cadence:cadence.moe. Message me and tell me you're interested in OOYE!
* The L1 and L2 emojis

## Initial setup

Node.js version 18 or later is required: https://nodejs.org/en/download/releases (the matrix-appservice dependency demands 18)

Install dependencies: `npm install --save-dev`

Copy `config.example.js` to `config.js` and fill in Discord token.

Copy `registration.example.yaml` to `registration.yaml` and fill in bracketed values. Register it in Synapse's `homeserver.yaml` through the usual appservice installation process, then restart Synapse.

If developing on a different computer to the one running the homeserver, use SSH port forwarding so that Synapse can connect on its `localhost:6693` to reach the running bridge on your computer. Example: `ssh -T -v -R 6693:localhost:6693 username@matrix.cadence.moe`

Run `node scripts/seed.js` to check your setup, then create the database and server state (only need to run this once ever)

Make sure the tests work: `npm t`

Start the bridge: `node start.js`

Any files you change will automatically be reloaded, except for `stdin.js` and `d2m/discord-*.js`

I recommend developing in Visual Studio Code so that the JSDoc x TypeScript annotation comments work. I don't know which other editors or language servers support annotations and type inference.

## Repository structure

    .
    * Run this to start the bridge:
    ├── start.js
    * Runtime configuration, like tokens and user info:
    ├── config.js
    ├── registration.yaml
    * The bridge's SQLite database is stored here:
    ├── db
    │   └── *.sql, *.db
    * Discord-to-Matrix bridging:
    ├── d2m
    │   * Execute actions through the whole flow, like sending a Discord message to Matrix:
    │   ├── actions
    │   │   └── *.js
    │   * Convert data from one form to another without depending on bridge state. Called by actions:
    │   ├── converters
    │   │   └── *.js
    │   * Making Discord work:
    │   ├── discord-*.js
    │   * Listening to events from Discord and dispatching them to the correct `action`:
    │   └── event-dispatcher.js
    * Matrix-to-Discord bridging:
    ├── m2d
    │   * Execute actions through the whole flow, like sending a Matrix message to Discord:
    │   ├── actions
    │   │   ├── *.js
    │   ├── converters
    │   │   └── *.js
    │   └── event-dispatcher.js
    * We aren't using the matrix-js-sdk, so here's all the stuff we need to call the Matrix C-S API:
    ├── matrix
    │   └── *.js
    * Various files you can run once if you need them. Hopefully you won't need them.
    ├── scripts
    │   ├── *.js
    │   * First time running a new bridge? Run this file to plant a seed, which will flourish into state for the bridge:
    │   └── seed.js
    * You are here! :)
    └── readme.md

## Dependency justification

(deduped transitive dependency count) dependency name: explanation

* (0) @chriscdn/promise-semaphore: It does what I want! I like it!
* (42) better-sqlite3: SQLite3 is the best database, and this is the best library for it. Really! I love it.
* (1) chunk-text: It does what I want.
* (0) cloudstorm: Discord gateway library with bring-your-own-caching that I trust.
* (8) snowtransfer: Discord API library with bring-your-own-caching that I trust.
* (1) discord-markdown: This is my fork! I make sure it does what I want.
* (1) heatsync: Module hot-reloader that I trust.
* (1) js-yaml: It seems to do what I want, and it's already pulled in by matrix-appservice.
* (70) matrix-appservice: I wish it didn't pull in express :(
* (0) mixin-deep: This is my fork! It fixes a bug in regular mixin-deep.
* (3) node-fetch@2: I like it and it does what I want.
* (0) pngjs: Lottie stickers are converted to bitmaps with the vendored Rlottie WASM build, then the bitmaps are converted to PNG with pngjs.
* (0) prettier-bytes: It does what I want and has no dependencies.
* (0) try-to-catch: Not strictly necessary, but it does what I want and has no dependencies.
* (1) turndown: I need an HTML-to-Markdown converter and this one looked suitable enough. It has some bugs that I've worked around, so I might switch away from it later.
