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
	ooye: {
		namespace_prefix: string
		max_file_size: number
		server_name: string
		server_origin: string
		invite: string[]
	}
	old_bridge?: {
		as_token: string
		database: string
	}
}

export type WebhookCreds = {
	id: string
	token: string
}

export namespace Event {
	export type Outer<T> = {
		type: string
		room_id: string
		sender: string
		content: T
		origin_server_ts: number
		unsigned: any
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
		unsigned: any
		event_id: string
		user_id: string
		age: number
		replaces_state: string
		prev_content?: any
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
}

export type Pagination<T> = {
	chunk: T[]
	next_batch?: string
	prev_match?: string
}
