# Out Of Your Element

<img src="docs/img/icon.png" height="128" width="128">

Modern Matrix-to-Discord appservice bridge, created by [@cadence:cadence.moe](https://matrix.to/#/@cadence:cadence.moe)

[![Releases](https://img.shields.io/gitea/v/release/cadence/out-of-your-element?gitea_url=https%3A%2F%2Fgitdab.com&style=plastic&color=green)](https://gitdab.com/cadence/out-of-your-element/releases) [![Discuss on Matrix](https://img.shields.io/badge/discuss-%23out--of--your--element-white?style=plastic)](https://matrix.to/#/#out-of-your-element:cadence.moe)

## Docs

This readme has the most important info. The rest is [in the docs folder.](https://gitdab.com/cadence/out-of-your-element/src/branch/main/docs)

## Why a new bridge?

* Modern: Supports new Discord features like replies, threads and stickers, and new Matrix features like edits, spaces and space membership.
* Efficient: Special attention has been given to memory usage, database indexes, disk footprint, runtime algorithms, and queries to the homeserver.
* Reliable: Any errors on either side are notified on Matrix and can be retried.
* Tested: A test suite and code coverage make sure all the logic and special cases work.
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
* PluralKit members have persistent user accounts
* Larger files from Discord are linked instead of reuploaded to Matrix (links don't expire)
* Simulated user accounts are named @the_persons_username rather than @112233445566778899

For more information about features, [see the user guide.](https://gitdab.com/cadence/out-of-your-element/src/branch/main/docs/user-guide.md)

## Caveats

* This bridge is not designed for puppetting.
* Direct Messaging is not supported until I figure out a good way of doing it.

## Efficiency details

Using WeatherStack as a thin layer between the bridge application and the Discord API lets us control exactly what data is cached in memory. Only necessary information is cached. For example, member data, user data, message content, and past edits are never stored in memory. This keeps the memory usage low and also prevents it ballooning in size over the bridge's runtime.

The bridge uses a small SQLite database to store relationships like which Discord messages correspond to which Matrix messages. This is so the bridge knows what to edit when some message is edited on Discord. Using `without rowid` on the database tables stores the index and the data in the same B-tree. Since Matrix and Discord's internal IDs are quite long, this vastly reduces storage space because those IDs do not have to be stored twice separately. Some event IDs and URLs are actually stored as xxhash integers to reduce storage requirements even more. On my personal instance of OOYE, every 300,000 messages (representing a year of conversations) requires 47.3 MB of storage space in the SQLite database.

Only necessary data and columns are queried from the database. We only contact the homeserver API if the database doesn't contain what we need.

File uploads (like avatars from bridged members) are checked locally and deduplicated. Only brand new files are uploaded to the homeserver. This saves loads of space in the homeserver's media repo, especially for Synapse.

Switching to [WAL mode](https://www.sqlite.org/wal.html) could improve your database access speed even more. Run `node scripts/wal.js` if you want to switch to WAL mode. (This will also enable `synchronous = NORMAL`.)

# Setup

If you get stuck, you're welcome to message [#out-of-your-element:cadence.moe](https://matrix.to/#/#out-of-your-element:cadence.moe) or [@cadence:cadence.moe](https://matrix.to/#/@cadence:cadence.moe) to ask for help setting up OOYE!

You'll need:

* Administrative access to a homeserver
* Discord bot
* Domain name for the bridge's website ([more info](https://gitdab.com/cadence/out-of-your-element/src/branch/main/docs/why-does-the-bridge-have-a-website.md)

Follow these steps:

1. [Get Node.js version 20 or later](https://nodejs.org/en/download/prebuilt-installer)

1. Switch to a normal user account. (i.e. do not run any of the following commands as root or sudo.)

1. Clone this repo and checkout a specific tag. (Development happens on main. Stable versions are tagged.)
	* The latest release tag is ![](https://img.shields.io/gitea/v/release/cadence/out-of-your-element?gitea_url=https%3A%2F%2Fgitdab.com&style=flat-square&label=%20&color=black).

1. Install dependencies: `npm install`

1. Run `npm run setup` to check your setup and set the bot's initial state. It will prompt you for information. You only need to run this once ever.

1. Start the bridge: `npm run start`

1. Add the bot to a server - use any *one* of the following commands for an invite link:
	* (in the REPL) `addbot`
	* $ `node addbot.js`
	* $ `npm run addbot`
	* $ `./addbot.sh`

Now any message on Discord will create the corresponding rooms on Matrix-side. After the rooms have been created, Matrix and Discord users can chat back and forth.

To get into the rooms on your Matrix account, use the `/invite [your mxid here]` command on Discord.

# Development setup

* Install development dependencies with `npm install --save-dev` so you can run the tests.
* Most files you change, such as actions, converters, and web, will automatically be reloaded.
* If developing on a different computer to the one running the homeserver, use SSH port forwarding so that Synapse can connect on its `localhost:6693` to reach the running bridge on your computer. Example: `ssh -T -v -R 6693:localhost:6693 me@matrix.cadence.moe`
* I recommend developing in Visual Studio Code so that the JSDoc x TypeScript annotation comments work. I don't know which other editors or language servers support annotations and type inference.

## Repository structure

    .
    * Runtime configuration, like tokens and user info:
    ├── registration.yaml
    * You are here! :)
    ├── readme.md
	 * The bridge's SQLite database is stored here:
	 ├── ooye.db*
    * Source code
    └── src
        * Database schema:
        ├── db
		  │   ├── orm.js, orm-defs.d.ts
		  │   * Migrations change the database schema when you update to a newer version of OOYE:
        │   ├── migrate.js
        │   └── migrations
        │       └── *.sql, *.js
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
        * Discord bot commands and menus:
        ├── discord
        │   ├── interactions
        │   │   └── *.js
        │   └── discord-command-handler.js
        * Matrix-to-Discord bridging:
        ├── m2d
        │   * Execute actions through the whole flow, like sending a Matrix message to Discord:
        │   ├── actions
        │   │   └── *.js
        │   * Convert data from one form to another without depending on bridge state. Called by actions:
        │   ├── converters
        │   │   └── *.js
        │   * Listening to events from Matrix and dispatching them to the correct `action`:
        │   └── event-dispatcher.js
        * We aren't using the matrix-js-sdk, so here are all the functions for the Matrix C-S and Appservice APIs:
        ├── matrix
        │   └── *.js
        * Various files you can run once if you need them.
        └── scripts
            * First time running a new bridge? Run this file to set up prerequisites on the Matrix server:
            ├── setup.js
            * Hopefully you won't need the rest of these. Code quality varies wildly.
            └── *.js

## Dependency justification

Total transitive production dependencies: 148

### <font size="+2">🦕</font>

* (31) better-sqlite3: SQLite3 is the best database, and this is the best library for it.
* (27) @cloudrac3r/pug: Language for dynamic web pages. This is my fork. (I released code that hadn't made it to npm, and removed the heavy pug-filters feature.)
* (16) stream-mime-type@1: This seems like the best option. Version 1 is used because version 2 is ESM-only.
* (14) h3: Web server. OOYE needs this for the appservice listener, authmedia proxy, and more. 14 transitive dependencies is on the low end for a web server.
* (11) sharp: Image resizing and compositing. OOYE needs this for the emoji sprite sheets.

### <font size="-1">🪱</font>

* (0) @chriscdn/promise-semaphore: It does what I want.
* (1) @cloudrac3r/discord-markdown: This is my fork.
* (0) @cloudrac3r/giframe: This is my fork.
* (1) @cloudrac3r/html-template-tag: This is my fork.
* (0) @cloudrac3r/in-your-element: This is my Matrix Appservice API library. It depends on h3 and zod, which are already pulled in by OOYE.
* (0) @cloudrac3r/mixin-deep: This is my fork. (It fixes a bug in regular mixin-deep.)
* (0) @cloudrac3r/pngjs: Lottie stickers are converted to bitmaps with the vendored Rlottie WASM build, then the bitmaps are converted to PNG with pngjs.
* (0) @cloudrac3r/turndown: This HTML-to-Markdown converter looked the most suitable. I forked it to change the escaping logic to match the way Discord works.
* (3) @stackoverflow/stacks: Stack Overflow design language and icons.
* (0) ansi-colors: Helps with interactive prompting for the initial setup, and it's already pulled in by enquirer.
* (1) chunk-text: It does what I want.
* (0) cloudstorm: Discord gateway library with bring-your-own-caching that I trust.
* (0) domino: DOM implementation that's already pulled in by turndown.
* (1) enquirer: Interactive prompting for the initial setup rather than forcing users to edit YAML non-interactively.
* (0) entities: Looks fine. No dependencies.
* (0) get-relative-path: Looks fine. No dependencies.
* (0) get-stream: Only needed if content_length_workaround is true.
* (1) heatsync: Module hot-reloader that I trust.
* (1) js-yaml: Will be removed in the future after registration.yaml is converted to JSON.
* (0) lru-cache: For holding unused nonce in memory and letting them be overwritten later if never used.
* (0) minimist: It's already pulled in by better-sqlite3->prebuild-install.
* (3) node-fetch@2: I like it and it does what I want. Version 2 is used because version 3 is ESM-only.
* (0) prettier-bytes: It does what I want and has no dependencies.
* (2) snowtransfer: Discord API library with bring-your-own-caching that I trust.
* (0) try-to-catch: Not strictly necessary, but it's already pulled in by supertape, so I may as well.
* (0) uqr: QR code SVG generator. Used on the website to scan in an invite link.
* (0) xxhash-wasm: Used where cryptographically secure hashing is not required.
* (0) zod: Input validation for the web server. It's popular and easy to use.
