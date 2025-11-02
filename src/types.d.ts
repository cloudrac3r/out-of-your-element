export type AppServiceRegistrationConfig = {
	id: string
	as_token: string
	hs_token: string
	url: string
	sender_localpart: string
	namespaces: {
		users: {
			exclusive: boolean
			regex: string
		}[]
		aliases: {
			exclusive: boolean
			regex: string
		}[]
	}
	protocols: [string]
	rate_limited: boolean
	socket?: string | number,
	ooye: {
		namespace_prefix: string
		max_file_size: number
		server_name: string
		server_origin: string
		bridge_origin: string
		discord_token: string
		discord_client_secret: string
		content_length_workaround: boolean
		include_user_id_in_mxid: boolean
		invite: string[]
		discord_origin?: string
		discord_cdn_origin?: string,
		web_password: string
		time_zone?: string
	}
	old_bridge?: {
		as_token: string
		database: string
	}
}

export type InitialAppServiceRegistrationConfig = {
	id: string
	as_token: string
	hs_token: string
	sender_localpart: string
	namespaces: {
		users: {
			exclusive: boolean
			regex: string
		}[]
		aliases: {
			exclusive: boolean
			regex: string
		}[]
	}
	protocols: [string]
	rate_limited: boolean
	socket?: string | number,
	ooye: {
		namespace_prefix: string
		server_name: string
		max_file_size: number
		content_length_workaround: boolean
		invite: string[]
		include_user_id_in_mxid: boolean
	}
}

export type WebhookCreds = {
	id: string
	token: string
}

export type PkSystem = {
	id: string
	uuid: string
	name: string | null
	description: string | null
	tag: string | null
	pronouns: string | null
	avatar_url: string | null
	banner: string | null
	color: string | null
	created: string | null
}

export type PkMember = {
	id: string
	uuid: string
	name: string
	display_name: string | null
	color: string | null
	birthday: string | null
	pronouns: string | null
	avatar_url: string | null
	webhook_avatar_url: string | null
	banner: string | null
	description: string | null
	created: string | null
	keep_proxy: boolean
	tts: boolean
	autoproxy_enabled: boolean | null
	message_count: number | null
	last_message_timestamp: string
}

export type PkMessage = {
	system: PkSystem
	member: PkMember
	sender: string
}

export namespace Event {
	export type Outer<T> = {
		type: string
		room_id: string
		sender: string
		content: T
		origin_server_ts: number
		unsigned?: any
		event_id: string
	}

	export type StateOuter<T> = Outer<T> & {
		state_key: string
	}

	export type ReplacementContent<T> = T & {
		"m.new_content": T
		"m.relates_to": {
			rel_type: string // "m.replace"
			event_id: string
		}
	}

	export type BaseStateEvent = {
		type: string
		room_id: string
		sender: string
		content: any
		state_key: string
		origin_server_ts: number
		unsigned?: any
		event_id: string
		user_id: string
		age: number
		replaces_state: string
		prev_content?: any
	}

	export type StrippedChildStateEvent = {
		type: string
		state_key: string
		sender: string
		origin_server_ts: number
		content: any
	}

	export type M_Room_Message = {
		msgtype: "m.text" | "m.emote"
		body: string
		format?: "org.matrix.custom.html"
		formatted_body?: string,
		"m.relates_to"?: {
			"m.in_reply_to": {
				event_id: string
			}
			rel_type?: "m.replace"
			event_id?: string
		}
	}

	export type Outer_M_Room_Message = Outer<M_Room_Message> & {type: "m.room.message"}

	export type M_Room_Message_File = {
		msgtype: "m.file" | "m.image" | "m.video" | "m.audio"
		body: string
		format?: "org.matrix.custom.html"
		formatted_body?: string
		filename?: string
		url: string
		info?: any
		"m.relates_to"?: {
			"m.in_reply_to": {
				event_id: string
			}
			rel_type?: "m.replace"
			event_id?: string
		}
	}

	export type Outer_M_Room_Message_File = Outer<M_Room_Message_File> & {type: "m.room.message"}

	export type M_Room_Message_Encrypted_File = {
		msgtype: "m.file" | "m.image" | "m.video" | "m.audio"
		body: string
		format?: "org.matrix.custom.html"
		formatted_body?: string
		filename?: string
		file: {
			url: string
			iv: string
			hashes: {
				sha256: string
			}
			v: "v2"
			key: {
				/** :3 */
				kty: "oct"
				/** must include at least "encrypt" and "decrypt" */
				key_ops: string[]
				alg: "A256CTR"
				k: string
				ext: true
			}
		},
		info?: any
		"m.relates_to"?: {
			"m.in_reply_to": {
				event_id: string
			}
			rel_type?: "m.replace"
			event_id?: string
		}
	}

	export type Outer_M_Room_Message_Encrypted_File = Outer<M_Room_Message_Encrypted_File> & {type: "m.room.message"}

	export type M_Sticker = {
		body: string
		url: string
		info?: {
			mimetype?: string
			w?: number
			h?: number
			size?: number
			thumbnail_info?: any
			thumbnail_url?: string
		}
	}

	export type Outer_M_Sticker = Outer<M_Sticker> & {type: "m.sticker"}

	export type M_Room_Member = {
		membership: string
		displayname?: string
		avatar_url?: string
	}

	export type M_Room_Avatar = {
		discord_path?: string
		url?: string
	}

	export type M_Room_Name = {
		name?: string
	}

	export type M_Room_Topic = {
		topic?: string
	}

	export type M_Room_PinnedEvents = {
		pinned: string[]
	}

	export type M_Power_Levels = {
		/** The level required to ban a user. Defaults to 50 if unspecified. */
		ban?: number,
		/** The level required to send specific event types. This is a mapping from event type to power level required. */
		events?: {
			[event_id: string]: number
		},
		/** The default level required to send message events. Can be overridden by the `events` key. Defaults to 0 if unspecified. */
		events_default?: number,
		/** The level required to invite a user. Defaults to 0 if unspecified. */
		invite?: number,
		/** The level required to kick a user. Defaults to 50 if unspecified. */
		kick?: number,
		/** The power level requirements for specific notification types. This is a mapping from `key` to power level for that notifications key. */
		notifications?: {
			room: number,
			[key: string]: number
		},
		/** The level required to redact an event sent by another user. Defaults to 50 if unspecified. */
		redact?: number,
		/** The default level required to send state events. Can be overridden by the `events` key. Defaults to 50 if unspecified. */
		state_default?: number,
		/** The power levels for specific users. This is a mapping from `user_id` to power level for that user. */
		users?: {
			[mxid: string]: number
		},
		/**The power level for users in the room whose `user_id` is not mentioned in the `users` key. Defaults to 0 if unspecified. */
		users_default?: number
	}

	export type M_Space_Child = {
		via?: string[]
		suggested?: boolean
	}

	export type M_Reaction = {
		"m.relates_to": {
			rel_type: "m.annotation"
			event_id: string // the event that was reacted to
			key: string // the unicode emoji, mxc uri, or reaction text
		},
		"shortcode"?: string // starts and ends with colons
	}

	export type Outer_M_Room_Redaction = Outer<{
		reason?: string
	}> & {
		redacts: string
	}
}

export namespace R {
	export type RoomCreated = {
		room_id: string
	}

	export type RoomJoined = {
		room_id: string
	}

	export type RoomMember = {
		avatar_url: string
		displayname: string
	}

	export type FileUploaded = {
		content_uri: string
	}

	export type Registered = {
		/** "@localpart:domain.tld" */
		user_id: string
		home_server: string
		access_token: string
		device_id: string
	}

	export type EventSent = {
		event_id: string
	}

	export type EventRedacted = {
		event_id: string
	}

	export type Hierarchy = {
		avatar_url?: string
		canonical_alias?: string
		children_state: Event.StrippedChildStateEvent[]
		guest_can_join: boolean
		join_rule?: string
		name?: string
		num_joined_members: number
		room_id: string
		room_type?: string
	}

	export type ResolvedRoom = {
		room_id: string
		servers: string[]
	}
}

export type Pagination<T> = {
	chunk: T[]
	next_batch?: string
	prev_match?: string
}

export type HierarchyPagination<T> = {
	rooms: T[]
	next_batch?: string
}
