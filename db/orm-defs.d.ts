export type Models = {
	channel_room: {
		channel_id: string
		room_id: string
		name: string
		nick: string | null
		thread_parent: string | null
		custom_avatar: string | null
	}

	event_message: {
		event_id: string
		message_id: string
		event_type: string | null
		event_subtype: string | null
		part: number
		source: number
	}

	file: {
		discord_url: string
		mxc_url: string
	}

	guild_space: {
		guild_id: string
		space_id: string
	}

	lottie: {
		sticker_id: string
		mxc_url: string
	}

	member_cache: {
		room_id: string
		mxid: string
		displayname: string | null
		avatar_url: string | null
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

	webhook: {
		channel_id: string
		webhook_id: string
		webhook_token: string
	}

	emoji: {
		emoji_id: string
		name: string
		animated: number
		mxc_url: string
	}

	reaction: {
		hashed_event_id: number
		message_id: string
		encoded_emoji: string
	}
}

export type Prepared<Row> = {
	pluck: () => Prepared<Row[keyof Row]>
	safeIntegers: () => Prepared<{[K in keyof Row]: Row[K] extends number ? BigInt : Row[K]}>
	all: (..._: any[]) => Row[]
	get: (..._: any[]) => Row | null
}

export type AllKeys<U> = U extends any ? keyof U : never
export type PickTypeOf<T, K extends AllKeys<T>> = T extends { [k in K]?: any } ? T[K] : never
export type Merge<U> = {[x in AllKeys<U>]: PickTypeOf<U, x>}
