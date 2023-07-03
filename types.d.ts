export type AppServiceRegistrationConfig = {
	id: string
	as_token: string
	hs_token: string
	url: string
	sender_localpart: string
	namespace_prefix: string
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
}

export type WebhookCreds = {
	id: string
	token: string
}

namespace Event {
	export type Outer<T> = {
		type: string
		room_id: string
		sender: string
		content: T
		origin_server_ts: number
		unsigned: any
		event_id: string
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
		msgtype: "m.text"
		body: string
		formatted_body?: "org.matrix.custom.html"
		format?: string
	}

	export type M_Room_Member = {
		membership: string
		display_name?: string
		avatar_url?: string
	}
}

namespace R {
	export type RoomCreated = {
		room_id: string
	}

	export type RoomJoined = {
		room_id: string
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
}
