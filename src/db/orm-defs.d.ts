export type Models = {
	auto_emoji: {
		name: string
		emoji_id: string
	}

	channel_room: {
		channel_id: string
		room_id: string
		name: string
		nick: string | null
		thread_parent: string | null
		custom_avatar: string | null
		last_bridged_pin_timestamp: number | null
		speedbump_id: string | null
		speedbump_webhook_id: string | null
		speedbump_checked: number | null
		guild_id: string | null
		custom_topic: number
	}

	direct: {
		mxid: string
		room_id: string
	}

	emoji: {
		emoji_id: string
		name: string
		animated: number
		mxc_url: string
	}

	event_message: {
		event_id: string
		message_id: string
		event_type: string | null
		event_subtype: string | null
		part: number
		reaction_part: number
		source: number
	}

	file: {
		discord_url: string
		mxc_url: string
	}

	guild_space: {
		guild_id: string
		space_id: string
		privacy_level: number
		presence: 0 | 1
		url_preview: 0 | 1
	}

	guild_active: {
		guild_id: string
		autocreate: 0 | 1
	}

	invite: {
		mxid: string
		room_id: string
		type: string | null
		name: string | null
		avatar: string | null
	}

	lottie: {
		sticker_id: string
		mxc_url: string
	}

	media_proxy: {
		permitted_hash: number
	}

	member_cache: {
		room_id: string
		mxid: string
		displayname: string | null
		avatar_url: string | null,
		power_level: number
	}

	member_power: {
		mxid: string
		room_id: string
		power_level: number
	}

	message_channel: {
		message_id: string
		channel_id: string
	}

	sim: {
		user_id: string
		sim_name: string
		localpart: string
		mxid: string
	}

	sim_member: {
		mxid: string
		room_id: string
		hashed_profile_content: number
	}

	sim_proxy: {
		user_id: string
		proxy_owner_id: string
		displayname: string
	}

	webhook: {
		channel_id: string
		webhook_id: string
		webhook_token: string
	}

	reaction: {
		hashed_event_id: number
		message_id: string
		encoded_emoji: string
		original_encoding: string | null
	}
}

export type Prepared<Row> = {
	pluck: () => Prepared<Row[keyof Row]>
	safeIntegers: () => Prepared<{[K in keyof Row]: Row[K] extends number ? BigInt : Row[K]}>
	raw: () => Prepared<Row[keyof Row][]>
	all: (..._: any[]) => Row[]
	get: (..._: any[]) => Row | null | undefined
}

export type AllKeys<U> = U extends any ? keyof U : never
export type PickTypeOf<T, K extends AllKeys<T>> = T extends { [k in K]?: any } ? T[K] : never
export type Merge<U> = {[x in AllKeys<U>]: PickTypeOf<U, x>}
export type Nullable<T> = {[k in keyof T]: T[k] | null}
export type Numberish<T> = {[k in keyof T]: T[k] extends number ? (number | bigint) : T[k]}
export type ValueOrArray<T> = {[k in keyof T]: T[k][] | T[k]}
