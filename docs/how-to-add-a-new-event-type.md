# How to add a new event type

It's much easier to understand code with examples. So let's go through it together and add support for **pinned events** to Out Of Your Element.

## Gathering intel

First, we need to know what pinned events are supposed to look like. The Matrix C-S spec gives this example:

> **pinned** ... [string] ... Required: An ordered list of event IDs to pin.
> ```json
> {
>   "content": {
>     "pinned": [
>       "$someevent:example.org"
>     ]
>   },
>   "event_id": "$143273582443PhrSn:example.org",
>   "room_id": "!jEsUZKDJdhlrceRyVU:example.org",
>   "sender": "@example:example.org",
>   "state_key": "",
>   "type": "m.room.pinned_events",
> }
> ```

This is part of the persistent room state. Simple enough. To update this, the state event and its list of pinned events is updated as a whole.

What does it look like on Discord-side?

> **Get Pinned Messages** \
> `GET` `/channels/{channel.id}/pins` \
> Returns all pinned messages in the channel as an array of message objects.

This is an API request to get the pinned messages. To update this, an API request will pin or unpin any specific message, adding or removing it from the list.

## What will the converter do?

The converter will be very different in both directions.

**For d2m, we will get the list of pinned messages, we will convert each message ID into the ID of an event we already have, and then we will set the entire `m.room.pinned_events` state to that list.**

**For m2d, we will have to diff the list of pinned messages against the previous version of the list, and for each event that was pinned or unpinned, we will send an API request to Discord to change its st**ate.

## Missing messages

> ...we will convert each message ID into the ID of an event ***we already have***

As a couple of examples, the message might not be bridged if it was sent before OOYE was set up, or if OOYE just had a bug trying to handle that message. If a particular Discord message wasn't bridged, and then it gets pinned, we're in a bit of a pickle. We can't pin the Matrix equivalent because it doesn't exist.

In this situation we need to stop and think about the possible paths forward we could take.

* We could ignore this message and just not pin it.
* We could convert and send this message now with its original timestamp from the past, then pin this representation.

The latter method would still make the message appear at the bottom of the timeline for most Matrix clients, since for most the timestamp doesn't determine the actual _order._ It would then be confusing why an odd message suddenly appeared, because a pins change isn't that noticable in the room.

To avoid this problem, I'll just go with the former method and ignore the message, so Matrix will only have some of the pins that Discord has. We will need to watch out if a Matrix user edits this list of partial pins, because if we _only_ pinned things on Discord that were pinned on Matrix, then pins Matrix doesn't know about would be lost from Discord side.

In this situation I will prefer to keep the pins list inconsistent between both sides and only bridge _changes_ to the list.

If you were implementing this for real, you might have made different decisions than me, and that's okay. It's a matter of taste. You just need to be aware of the consequences of what you choose.

## Test data for the d2m converter

Let's start writing the d2m converter. It's helpful to write automated tests for Out Of Your Element, since this lets you check if it worked without having to start up a local copy of the bridge or mess around with the interface.

To test the Discord-to-Matrix pin converter, we'll need some samples of Discord message objects. Then we can put these sample message objects through the converter and check what comes out the other side.

Normally for getting test data, I would `curl` the Discord API to grab some real data and put it into `data.js` (and possibly also `ooye-test-data.sql`. But this time, I'll fabricate some test data. Here it is:

```js
[
	{id: "1126786462646550579"},
	{id: "1141501302736695316"},
	{id: "1106366167788044450"},
	{id: "1115688611186193400"}
]
```

"These aren't message objects!" I hear you cry. Correct. I already know that my implementation is not going to care about any properties on these message object other than the IDs, so to save time, I'm just making a list of IDs.

These IDs were carefully chosen. The first three are already in `ooye-test-data.sql` and are associated with event IDs. This is great, because in our test case, the Discord IDs will be converted to those event IDs. The fourth ID doesn't exist on Matrix-side. This is to test that partial pins are handled as expected, like I wrote in the previous section.

Now that I've got my list, I will make my first change to the code. I will add these IDs to `test/data.js`:

```diff
diff --git a/test/data.js b/test/data.js
index c36f252..4919beb 100644
--- a/test/data.js
+++ b/test/data.js
@@ -221,6 +221,14 @@ module.exports = {
                        deaf: false
                }
        },
+       pins: {
+               faked: [
+                       {id: "1126786462646550579"},
+                       {id: "1141501302736695316"},
+                       {id: "1106366167788044450"},
+                       {id: "1115688611186193400"}
+               ]
+       },
        message: {
                // Display order is text content, attachments, then stickers
                simple_plaintext: {
```

## Writing the d2m converter

We can write a function that operates on this data to convert it to events. This is a _converter,_ not an _action._ It won't _do_ anything by itself. So it goes in the converters folder. I've already planned (in the "What will the converter do?" section) what to do, so writing the function is pretty simple:

```diff
diff --git a/d2m/converters/pins-to-list.js b/d2m/converters/pins-to-list.js
new file mode 100644
index 0000000..e4107be
--- /dev/null
+++ b/d2m/converters/pins-to-list.js
@@ -0,0 +1,18 @@
+// @ts-check
+
+const {select} = require("../../passthrough")
+
+/**
+ * @param {import("discord-api-types/v10").RESTGetAPIChannelPinsResult} pins
+ */
+function pinsToList(pins) {
+       /** @type {string[]} */
+       const result = []
+       for (const message of pins) {
+               const eventID = select("event_message", "event_id", {message_id: message.id}).pluck().get()
+               if (eventID) result.push(eventID)
+       }
+       return result
+}
+
+module.exports.pinsToList = pinsToList
```

### Explaining the code

All converters have a `function` which does the work, and the function is added to `module.exports` so that other files can use it.

Importing `select` from `passthrough` lets us do database access. Calling the `select` function can select from OOYE's own SQLite database. If you want to see what's in the database, look at `ooye-test-data.sql` for test data, or open `ooye.db` for real data from your own bridge.

The comments `// @ts-check`, `/** @type ... */`, and `/** @param ... */` provide type-based autosuggestions when editing in Visual Studio Code.

Here's the code I haven't yet discussed:

```js
function pinsToList(pins) {
	const result = []
	for (const message of pins) {
		const eventID = select("event_message", "event_id", {message_id: message.id}).pluck().get()
		if (eventID) result.push(eventID)
	}
	return result
}
```

It will go through each `message` in `pins`. For each message, it will look up the corresponding Matrix event in the database, and if found, it will add it to `result`.

The `select` line will run this SQL: `SELECT event_id FROM event_message WHERE message_id = {the message ID}` and will return the event ID as a string or null.

For any database experts worried about an SQL query inside a loop, the N+1 problem does not apply to SQLite because the queries are executed in the same process rather than crossing a process (and network) boundary. https://www.sqlite.org/np1queryprob.html

## Test case for the d2m converter

There's not much room for bugs in this function. A single manual test that it works would be good enough for me. But since this is an example of how you can add your own, let's add a test case for this. The testing code will take the data we just prepared and process it through the `pinsToList` function we just wrote. Then, it will check the result is what we expected.

```diff
diff --git a/d2m/converters/pins-to-list.test.js b/d2m/converters/pins-to-list.test.js
new file mode 100644
index 0000000..c2e3774
--- /dev/null
+++ b/d2m/converters/pins-to-list.test.js
@@ -0,0 +1,12 @@
+const {test} = require("supertape")
+const data = require("../../test/data")
+const {pinsToList} = require("./pins-to-list")
+
+test("pins2list: converts known IDs, ignores unknown IDs", t => {
+       const result = pinsToList(data.pins.faked)
+       t.deepEqual(result, [
+               "$X16nfVks1wsrhq4E9SSLiqrf2N8KD0erD0scZG7U5xg",
+               "$mtR8cJqM4fKno1bVsm8F4wUVqSntt2sq6jav1lyavuA",
+               "$lnAF9IosAECTnlv9p2e18FG8rHn-JgYKHEHIh5qdFv4"
+       ])
+})
```

Don't forget to list your test in `test.js` so that it gets picked up:

```diff
diff --git a/test/test.js b/test/test.js
index 5cc851e..280503d 100644
--- a/test/test.js
+++ b/test/test.js
@@ -52,6 +52,7 @@ file._actuallyUploadDiscordFileToMxc = function(url, res) { throw new Error(`Not
        require("../d2m/converters/message-to-event.test")
        require("../d2m/converters/message-to-event.embeds.test")
        require("../d2m/converters/edit-to-changes.test")
+       require("../d2m/converters/pins-to-list.test")
        require("../d2m/converters/remove-reaction.test")
        require("../d2m/converters/thread-to-announcement.test")
        require("../d2m/converters/user-to-mxid.test")
```

Good to go.

### Explaining the code

`require("supertape")` is a library that helps with testing and printing test results. `data = require("../../test/data")` is the file we edited earlier in the "Test data for the d2m converter" section. `require("./pins-to-list")` is the function we want to test.

Here is how you declare a test: `test("pins2list: converts known IDs, ignores unknown IDs", t => {` The string describes what you are trying to test and it will be displayed if the test fails.

`result = pinsToList(data.pins.faked)` is calling the implementation function we wrote.

`t.deepEqual(actual, expected)` will check whether the `actual` result value is the same as our `expected` result value. If it's not, it'll mark that as a failed test.

### Run the test!

```
><> $ npm t

> out-of-your-element@1.1.0 test
> cross-env FORCE_COLOR=true supertape --no-check-assertions-count --format tap test/test.js | tap-dot

  pins2list: converts known IDs, ignores unknown IDs - should deep equal
    operator: deepEqual
      diff: |-
        Array [
          "$X16nfVks1wsrhq4E9SSLiqrf2N8KD0erD0scZG7U5xg",
      -   "$mtR8cJqM4fKno1bVsm8F4wUVqSntt2sq6jav1lyavuA",
      -   "$lnAF9IosAECTnlv9p2e18FG8rHn-JgYKHEHIh5qdFv4",
      +   "$51f4yqHinwnSbPEQ9dCgoyy4qiIJSX0QYYVUnvwyTCI",
      +   "$Ijf1MFCD39ktrNHxrA-i2aKoRWNYdAV2ZXYQeiZIgEU",
        ]
    at out-of-your-element/d2m/converters/pins-to-list.test.js:7:4
    Error: should deep equal
      at run (file:///out-of-your-element/node_modules/supertape/lib/operators.mjs:272:33)
      at Object.deepEqual (file:///out-of-your-element/node_modules/supertape/lib/operators.mjs:198:9)
      at out-of-your-element/d2m/converters/pins-to-list.test.js:7:4
      at module.exports (out-of-your-element/node_modules/try-to-catch/lib/try-to-catch.js:7:29)
```

Oh no! (I promise I didn't make it fail for demonstration purposes, this was actually an accident!) Let's see what this bug is. It's returning the right number of IDs, but 2 out of the 3 are incorrect. The green `-` lines are "expected" and the red `+` lines are "actual". The wrong ID `$51f...` must have been taken from _somewhere_ in the test data, so I'll first search the codebase and find where it came from:

```sql
-- snipped from ooye-test-data.sql
('$mtR8cJqM4fKno1bVsm8F4wUVqSntt2sq6jav1lyavuA', 'm.room.message', 'm.text', '1141501302736695316', 0, 1),
('$51f4yqHinwnSbPEQ9dCgoyy4qiIJSX0QYYVUnvwyTCI', 'm.room.message', 'm.image', '1141501302736695316', 1, 1),
```

Explanation: This Discord message `1141501302736695316` is actually part of 2 different Matrix events, `$mtR...` and `$51f...`. This often happens when a Discord user uploads an image with a caption. Matrix doesn't support combined image+text events, so the image and the text have to be bridged to separate events.

In the current code, `pinsToList` is picking ALL the associated event IDs, and then `.get` is forcing it to limit that list to 1. It doesn't care which, so it's essentially random which event it wants to pin.

We should make a decision on which event is more important. You can make whatever decision you want - you could even make it pin every event associated with a message - but I've decided that the text should be the primary part and be pinned, and the image should be considered a secondary part and left unpinned.

We already have a column `part` in the `event_message` table for this reason! When `part = 0`, that's the primary part. I'll edit the converter to actually use that column:

```diff
diff --git a/d2m/converters/pins-to-list.js b/d2m/converters/pins-to-list.js
index e4107be..f401de2 100644
--- a/d2m/converters/pins-to-list.js
+++ b/d2m/converters/pins-to-list.js
@@ -9,7 +9,7 @@ function pinsToList(pins) {
        /** @type {string[]} */
        const result = []
        for (const message of pins) {
-               const eventID = select("event_message", "event_id", {message_id: message.id}).pluck().get()
+               const eventID = select("event_message", "event_id", {message_id: message.id, part: 0}).pluck().get()
                if (eventID) result.push(eventID)
        }
        return result
```

As long as the database is consistent, this new `select` will return at most 1 event, always choosing the primary part.

```
><> $ npm t

  144 tests
  232 passed

  Pass!
```

## Wiring it up to an action

Actions call converters to do the thing, but actions have to receive their input event from somewhere. Let's wire it up so we receive a "pins changed" event from Discord and do the whole flow from there. Checking the documentation again, Discord will trigger this gateway event when the pins change:

> **Channel Pins Update** \
> Sent when a message is pinned or unpinned in a text channel. This is not sent when a pinned message is deleted. \
> **guild_id?** ... snowflake ... ID of the guild \
> **channel_id** ... snowflake ... ID of the channel \
> **last_pin_timestamp?** ... ?ISO8601 timestamp ... Time at which the most recent pinned message was pinned

Notably, the event doesn't deliver the actual list of pinned messages to us. We'll have to listen for this event, then trigger an API request to `GET` the pins list. Alright, enough preparation, time to code.

All packets are delivered to `discord-packets.js` which manages the internal state of the Discord object and then passes it on to a function in `event-dispatcher.js`:

```diff
diff --git a/d2m/discord-packets.js b/d2m/discord-packets.js
index 83c31cd..4de84d9 100644
--- a/d2m/discord-packets.js
+++ b/d2m/discord-packets.js
@@ -133,6 +133,9 @@ const utils = {
                                } else if (message.t === "CHANNEL_UPDATE") {
                                        await eventDispatcher.onChannelOrThreadUpdate(client, message.d, false)

+                               } else if (message.t === "CHANNEL_PINS_UPDATE") {
+                                       await eventDispatcher.onChannelPinsUpdate(client, message.d)
+
                                } else if (message.t === "THREAD_CREATE") {
                                        // @ts-ignore
                                        await eventDispatcher.onThreadCreate(client, message.d)
```

`event-dispatcher.js` will now check if the event seems reasonable and is allowed in this context. For example, we can only update pins if the channel is actually bridged somewhere. After the check, we'll call the action:

```diff
diff --git a/d2m/event-dispatcher.js b/d2m/event-dispatcher.js
index 0f9f1e6..6e91e9e 100644
--- a/d2m/event-dispatcher.js
+++ b/d2m/event-dispatcher.js
@@ -19,6 +19,8 @@ const announceThread = sync.require("./actions/announce-thread")
 const createRoom = sync.require("./actions/create-room")
 /** @type {import("./actions/create-space")}) */
 const createSpace = sync.require("./actions/create-space")
+/** @type {import("./actions/update-pins")}) */
+const updatePins = sync.require("./actions/update-pins")
 /** @type {import("../matrix/api")}) */
 const api = sync.require("../matrix/api")
 /** @type {import("../discord/discord-command-handler")}) */
@@ -157,6 +159,16 @@ module.exports = {
                await createRoom.syncRoom(channelOrThread.id)
        },

+       /**
+        * @param {import("./discord-client")} client
+        * @param {DiscordTypes.GatewayChannelPinsUpdateDispatchData} data
+        */
+       async onChannelPinsUpdate(client, data) {
+               const roomID = select("channel_room", "room_id", {channel_id: data.channel_id}).pluck().get()
+               if (!roomID) return // No target room to update pins in
+               await updatePins.updatePins(data.channel_id, roomID)
+       },
+
        /**
         * @param {import("./discord-client")} client
         * @param {DiscordTypes.GatewayMessageCreateDispatchData} message
```

And now I can write the `update-pins.js` action:

```diff
diff --git a/d2m/actions/update-pins.js b/d2m/actions/update-pins.js
new file mode 100644
index 0000000..40cc358
--- /dev/null
+++ b/d2m/actions/update-pins.js
@@ -0,0 +1,22 @@
+// @ts-check
+
+const passthrough = require("../../passthrough")
+const {discord, sync} = passthrough
+/** @type {import("../converters/pins-to-list")} */
+const pinsToList = sync.require("../converters/pins-to-list")
+/** @type {import("../../matrix/api")} */
+const api = sync.require("../../matrix/api")
+
+/**
+ * @param {string} channelID
+ * @param {string} roomID
+ */
+async function updatePins(channelID, roomID) {
+       const pins = await discord.snow.channel.getChannelPinnedMessages(channelID)
+       const eventIDs = pinsToList.pinsToList(pins)
+       await api.sendState(roomID, "m.room.pinned_events", "", {
+               pinned: eventIDs
+       })
+}
+
+module.exports.updatePins = updatePins
```

I try to keep as much logic as possible out of the actions and in the converters. This should mean I *never have to unit test the actions themselves.* The actions will be tested manually with the real bot.

## See if it works

Since the automated tests pass, let's start up the bridge and run our nice new code:

```
node start.js
```

We can try these things and see if they are bridged to Matrix:

- Pin a recent message on Discord-side
- Pin an old message on Discord-side
- Unpin a message on Discord-side

It works like I'd expect!

## Order of pinned messages

I expected that to be the end of the guide, but after some time, I noticed a new problem: The pins are in reverse order. How could this happen?

[After some investigation,](https://gitdab.com/cadence/out-of-your-element/issues/16) it turns out Discord puts the most recently pinned message at the start of the array and displays the array in forwards order, while Matrix puts the most recently pinned message at the end of the array and displays the array in reverse order.

We can fix this by reversing the order of the list of pins before we store it. The converter can do this:

```diff
diff --git a/d2m/converters/pins-to-list.js b/d2m/converters/pins-to-list.js
index f401de2..047bb9f 100644
--- a/d2m/converters/pins-to-list.js
+++ b/d2m/converters/pins-to-list.js
@@ -12,6 +12,7 @@ function pinsToList(pins) {
                const eventID = select("event_message", "event_id", {message_id: message.id, part: 0}).pluck().get()
                if (eventID) result.push(eventID)
        }
+       result.reverse()
        return result
 }
```

Since the results have changed, I'll need to update the test so it expects the new result:

```diff
diff --git a/d2m/converters/pins-to-list.test.js b/d2m/converters/pins-to-list.test.js
index c2e3774..92e5678 100644
--- a/d2m/converters/pins-to-list.test.js
+++ b/d2m/converters/pins-to-list.test.js
@@ -5,8 +5,8 @@ const {pinsToList} = require("./pins-to-list")
 test("pins2list: converts known IDs, ignores unknown IDs", t => {
        const result = pinsToList(data.pins.faked)
        t.deepEqual(result, [
-               "$X16nfVks1wsrhq4E9SSLiqrf2N8KD0erD0scZG7U5xg",
-               "$mtR8cJqM4fKno1bVsm8F4wUVqSntt2sq6jav1lyavuA",
-               "$lnAF9IosAECTnlv9p2e18FG8rHn-JgYKHEHIh5qdFv4"
+               "$lnAF9IosAECTnlv9p2e18FG8rHn-JgYKHEHIh5qdFv4",
+               "$mtR8cJqM4fKno1bVsm8F4wUVqSntt2sq6jav1lyavuA",
+               "$X16nfVks1wsrhq4E9SSLiqrf2N8KD0erD0scZG7U5xg"
        ])
 })
```

```
><> $ npm t

  144 tests
  232 passed

  Pass!
```

Next time a message is pinned or unpinned on Discord, OOYE should update the order of all the pins on Matrix.

## Notes on missed events

Note that this will only sync pins _when the pins change._ Existing pins from Discord will not be backfilled to Matrix rooms. If I wanted, there's a couple of ways I could address this:

* I could create a one-shot script in `scripts/update-pins.js` which will sync pins for _all_ Discord channels right away. I can run this after finishing the feature, or if the bot has been offline for some time.
* I could create a database table that holds the timestamp of the most recently detected pin for each channel - the `last_pin_timestamp` field from the gateway. Every time the bot starts, it would automatically compare the database table against every channel, and if the pins have changed since it last looked, it could automatically update them.

I already have code to backfill missed messages when the bridge starts up. The second option above would add a similar feature for backfilling missed pins. It would be worth considering.
