# API

There is a web API for getting information about things that are bridged with Out Of Your Element.

The base URL is the URL of the particular OOYE instance, for example, https://bridge.cadence.moe.

No authentication is required.

I'm happy to add more endpoints, just ask for them.

## Endpoint: GET /api/message

|Query parameter|Type|Description|
|---------------|----|-----------|
|`message_id`|regexp `/^[0-9]+$/`|Discord message ID to look up information for|

Response:

```typescript
{
  source: "matrix" | "discord"                // Which platform the message originated on
  matrix_author?: {                             // Only for Matrix messages; should be up-to-date rather than historical data
    displayname: string,                        // Matrix user's current display name
    avatar_url: string | null,                  // Absolute HTTP(S) URL to download the Matrix user's current avatar
    mxid: string                                // Matrix user ID, can never change
  },
  events: [                                   // Data about each individual event
    {
      metadata: {                               // Data from OOYE's database about how bridging was performed
        sender: string,                           // Same as matrix user ID
        event_id: string,                         // Unique ID of the event on Matrix, can never change
        event_type: "m.room.message" | string,    // Event type
        event_subtype: "m.text" | string | null,  // For m.room.message events, this is the msgtype property
        part: 0 | 1,                              // For multi-event messages, 0 if this is the first part
        reaction_part: 0 | 1,                     // For multi-event messages, 0 if this is the last part
        room_id: string,                          // Room ID that the event was sent in, linked to the Discord channel
        source: number
      },
      raw: {                                    // Raw historical event data from the Matrix API. Contains at least these properties:
        content: any,                             // The only non-metadata property, entirely client-generated
        type: string,
        room_id: string,
        sender: string,
        origin_server_ts: number,
        unsigned?: any,
        event_id: string,
        user_id: string
      }
    }
  ]
}
```
