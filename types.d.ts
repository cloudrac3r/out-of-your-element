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
		}
	}

	export type M_Room_Member = {
		membership: string
		display_name?: string
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
		}
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
		display_name: string
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
