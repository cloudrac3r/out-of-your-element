# Development setup

* Install development dependencies with `npm install --save-dev` so you can run the tests.
* Most files you change, such as actions, converters, and web, will automatically be reloaded.
* If developing on a different computer to the one running the homeserver, use SSH port forwarding so that Synapse can connect on its `localhost:6693` to reach the running bridge on your computer. Example: `ssh -T -v -R 6693:localhost:6693 me@matrix.cadence.moe`
* I recommend developing in Visual Studio Code so that the JSDoc x TypeScript annotation comments just work automatically. I don't know which other editors or language servers support annotations and type inference.

# Efficiency details

Using WeatherStack as a thin layer between the bridge application and the Discord API lets us control exactly what data is cached in memory. Only necessary information is cached. For example, member data, user data, message content, and past edits are never stored in memory. This keeps the memory usage low and also prevents it ballooning in size over the bridge's runtime.

The bridge uses a small SQLite database to store relationships like which Discord messages correspond to which Matrix messages. This is so the bridge knows what to edit when some message is edited on Discord. Using `without rowid` on the database tables stores the index and the data in the same B-tree. Since Matrix and Discord's internal IDs are quite long, this vastly reduces storage space because those IDs do not have to be stored twice separately. Some event IDs and URLs are actually stored as xxhash integers to reduce storage requirements even more. On my personal instance of OOYE, every 300,000 messages (representing a year of conversations) requires 47.3 MB of storage space in the SQLite database.

Only necessary data and columns are queried from the database. We only contact the homeserver API if the database doesn't contain what we need.

File uploads (like avatars from bridged members) are checked locally and deduplicated. Only brand new files are uploaded to the homeserver. This saves loads of space in the homeserver's media repo, especially for Synapse.

Switching to [WAL mode](https://www.sqlite.org/wal.html) could improve your database access speed even more. Run `node scripts/wal.js` if you want to switch to WAL mode. (This will also enable `synchronous = NORMAL`.)


# Repository structure

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

# Read next

If you haven't set up Out Of Your Element yet, you might find [Simplified homeserver setup](https://gitdab.com/cadence/out-of-your-element/src/branch/main/docs/simplified-homeserver-setup.md) helpful.

If you don't know what the Matrix event JSON generally looks like, turn on developer tools in your client (Element has pretty good ones). Right click a couple of messages and see what they look like on the inside.

I recommend first reading [How to add a new event type](https://gitdab.com/cadence/out-of-your-element/src/branch/main/docs/how-to-add-a-new-event-type.md) as this will fill you in on key information in how the codebase is organised, which data structures are important, and what level of abstraction we're working on.

If you haven't seen the [Discord API documentation](https://discord.com/developers/docs/) before, have a quick look at one of the pages on there. Same with the [Matrix Client-Server APIs](https://spec.matrix.org/latest/client-server-api/). You don't need to know these inside out, they're primarily references, not stories. But it is useful to have an idea of what a couple of the API endpoints look like, the kind of data they tend to accept, and the kind of data they tend to return.

Then you might like to peruse the other files in the docs folder. Most of these were written stream-of-thought style as I try to work through a problem and find the best way to implement it. You might enjoy getting inside my head and seeing me invent and evaluate ways to solve the problem.

Whether you read those or not, I'm more than happy to help you 1-on-1 with coding your dream feature. Join the chatroom [#out-of-your-element:cadence.moe](https://matrix.to/#/#out-of-your-element:cadence.moe) or PM me [@cadence:cadence.moe](https://matrix.to/#/@cadence:cadence.moe) and ask away.

# Dependency justification

Total transitive production dependencies: 137

### <font size="+2">🦕</font>

* (31) better-sqlite3: SQLite is the best database, and this is the best library for it.
* (27) @cloudrac3r/pug: Language for dynamic web pages. This is my fork. (I released code that hadn't made it to npm, and removed the heavy pug-filters feature.)
* (16) stream-mime-type@1: This seems like the best option. Version 1 is used because version 2 is ESM-only.
* (9) h3: Web server. OOYE needs this for the appservice listener, authmedia proxy, self-service, and more.
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
* (0) discord-api-types: Bitfields needed at runtime and types needed for development.
* (0) domino: DOM implementation that's already pulled in by turndown.
* (1) enquirer: Interactive prompting for the initial setup rather than forcing users to edit YAML non-interactively.
* (0) entities: Looks fine. No dependencies.
* (0) get-relative-path: Looks fine. No dependencies.
* (1) heatsync: Module hot-reloader that I trust.
* (1) js-yaml: Will be removed in the future after registration.yaml is converted to JSON.
* (0) lru-cache: For holding unused nonce in memory and letting them be overwritten later if never used.
* (0) prettier-bytes: It does what I want and has no dependencies.
* (0) snowtransfer: Discord API library with bring-your-own-caching that I trust.
* (0) try-to-catch: Not strictly necessary, but it's already pulled in by supertape, so I may as well.
* (0) uqr: QR code SVG generator. Used on the website to scan in an invite link.
* (0) xxhash-wasm: Used where cryptographically secure hashing is not required.
* (0) zod: Input validation for the web server. It's popular and easy to use.
