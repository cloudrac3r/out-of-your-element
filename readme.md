# Out Of Your Element

Modern Matrix-to-Discord appservice bridge.

## Why a new bridge?

* Modern: Supports new Discord features like replies, threads and stickers, and new Matrix features like edits, spaces and space membership.
* Efficient: Special attention has been given to memory usage, database indexes, disk footprint, runtime algorithms, and queries to the homeserver.
* Reliable: Any errors on either side are notified on Matrix and can be retried.
* Tested: A test suite and code coverage make sure all the core logic works.
* Simple development: No build step (it's JavaScript, not TypeScript), minimal/lightweight dependencies, and abstraction only where necessary so that less background knowledge is required. No need to learn about Intents or library functions.
* No locking algorithm: Other bridges use a locking algorithm which is a source of frequent bugs. This bridge avoids the need for one.
* Latest API: Being on the latest Discord API version lets it access all features, without the risk of deprecated API versions being removed.

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
* Embeds
* Guild-Space details syncing
* Channel-Room details syncing
* Custom emoji list syncing
* Custom emojis in messages
* Custom room names/avatars can be applied on Matrix-side
* Larger files from Discord are linked instead of reuploaded to Matrix

For more information about features, [see the user guide.](https://gitdab.com/cadence/out-of-your-element/src/branch/main/docs/user-guide.md)

## Caveats

* This bridge is not designed for puppetting.

## Efficiency details

Using WeatherStack as a thin layer between the bridge application and the Discord API lets us control exactly what data is cached. Only necessary information is cached. For example, member data, user data, message content, and past edits are never stored in memory. This keeps the memory usage low and also prevents it ballooning in size over the bridge's runtime.

The bridge uses a small SQLite database to store relationships like which Discord messages correspond to which Matrix messages. This is so the bridge knows what to edit when some message is edited on Discord. Using `without rowid` on the database tables stores the index and the data in the same B-tree. Since Matrix and Discord's internal IDs are quite long, this vastly reduces storage space because those IDs do not have to be stored twice separately. On my personal instance of OOYE, every 100,000 messages sent require only 17.7 MB of storage space in the SQLite database.

Only necessary data and columns are queried from the database. We only contact the homeserver API if the database doesn't contain what we need.

# Setup

If you get stuck, you're welcome to message @cadence:cadence.moe to ask for help setting up OOYE!

You'll need:

* Administrative access to a homeserver
* Discord bot
* Custom emojis named `L1` and `L2` for replies sent to Discord (TODO: provide)

Follow these steps:

1. [Get Node.js version 18 or later](https://nodejs.org/en/download/releases) (the version is required by the matrix-appservice dependency)

2. Install dependencies: `npm install --save-dev` (omit --save-dev if you will not run the automated tests)

3. Copy `config.example.js` to `config.js` and fill in Discord token.

4. Copy `registration.example.yaml` to `registration.yaml` and fill in bracketed values. You could generate each hex string with `dd if=/dev/urandom bs=32 count=1 2> /dev/null | basenc --base16 | dd conv=lcase 2> /dev/null`. Register the registration in Synapse's `homeserver.yaml` through the usual appservice installation process, then restart Synapse.

5. Run `node scripts/seed.js` to check your setup, create the database and server state (only need to run this once ever)

6. Make sure the tests work by running `npm t`

7. Start the bridge: `node start.js`

8. Add the bot to a server - use any *one* of the following commands for an invite link:
	* (in the REPL) `addbot`
	* (in a chat) `//addbot`
	* $ `node addbot.js`
	* $ `npm run addbot`
	* $ `./addbot.sh`

# Development information

* Be sure to install dependencies with `--save-dev` so you can run the tests.
* Any files you change will automatically be reloaded, except for `stdin.js` and `d2m/discord-*.js`.
* If developing on a different computer to the one running the homeserver, use SSH port forwarding so that Synapse can connect on its `localhost:6693` to reach the running bridge on your computer. Example: `ssh -T -v -R 6693:localhost:6693 me@matrix.cadence.moe`
* I recommend developing in Visual Studio Code so that the JSDoc x TypeScript annotation comments work. I don't know which other editors or language servers support annotations and type inference.

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
    │   │   └── *.js
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
* (0) giframe: This is my fork! It should do what I want.
* (1) heatsync: Module hot-reloader that I trust.
* (1) js-yaml: It seems to do what I want, and it's already pulled in by matrix-appservice.
* (70) matrix-appservice: I wish it didn't pull in express :(
* (0) mixin-deep: This is my fork! It fixes a bug in regular mixin-deep.
* (3) node-fetch@2: I like it and it does what I want.
* (0) pngjs: Lottie stickers are converted to bitmaps with the vendored Rlottie WASM build, then the bitmaps are converted to PNG with pngjs.
* (0) prettier-bytes: It does what I want and has no dependencies.
* (51) sharp: Jimp has fewer dependencies, but sharp is faster.
* (0) try-to-catch: Not strictly necessary, but it does what I want and has no dependencies.
* (1) turndown: I need an HTML-to-Markdown converter and this one looked suitable enough. It has some bugs that I've worked around, so I might switch away from it later.
