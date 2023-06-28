// @ts-check

const DiscordTypes = require("discord-api-types/v10")

module.exports = {
	channel: {
		general: {
			type: 0,
			topic: "https://docs.google.com/document/d/blah/edit | I spread, pipe, and whip because it is my will. :headstone:",
			rate_limit_per_user: 0,
			position: 0,
			permission_overwrites: [],
			parent_id: null,
			nsfw: false,
			name: "collective-unconscious" ,
			last_pin_timestamp: "2023-04-06T09:51:57+00:00",
			last_message_id: "1103832925784514580",
			id: "112760669178241024",
			default_thread_rate_limit_per_user: 0,
			guild_id: "112760669178241024"
		}
	},
	room: {
		general: {
			"m.room.name/": {name: "main"},
			"m.room.topic/": {topic: "collective-unconscious | https://docs.google.com/document/d/blah/edit | I spread, pipe, and whip because it is my will. :headstone:\n\nChannel ID: 112760669178241024\nGuild ID: 112760669178241024"},
			"m.room.guest_access/": {guest_access: "can_join"},
			"m.room.history_visibility/": {history_visibility: "invited"},
			"m.space.parent/!jjWAGMeQdNrVZSSfvz:cadence.moe": {
				via: ["cadence.moe"], // TODO: put the proper server here
				canonical: true
			},
			"m.room.join_rules/": {
				join_rule: "restricted",
				allow: [{
					type: "m.room_membership",
					room_id: "!jjWAGMeQdNrVZSSfvz:cadence.moe"
				}]
			},
			"m.room.avatar/": {
				discord_path: "/icons/112760669178241024/a_f83622e09ead74f0c5c527fe241f8f8c.png?size=1024",
				url: "mxc://cadence.moe/zKXGZhmImMHuGQZWJEFKJbsF"
			}
		}
	},
	guild: {
		general: {
			owner_id: "112760500130975744",
			premium_tier: 3,
			stickers: [{
				version: 1683838696974,
				type: 2,
				tags: "sunglasses",
				name: "pomu puff",
				id: "1106323941183717586",
				guild_id: "112760669178241024",
				format_type: 1,
				description: "damn that tiny lil bitch really chuffing. puffing that fat ass dart",
				available: true,
				asset: ""
			}],
			max_members: 500000,
			splash: "86a34ed02524b972918bef810087f8e7",
			explicit_content_filter: 0,
			afk_channel_id: null,
			nsfw_level: 0,
			description: null,
			preferred_locale: "en-US",
			system_channel_id: "112760669178241024",
			mfa_level: 0,
			/** @type {300} */
			afk_timeout: 300,
			id: "112760669178241024",
			icon: "a_f83622e09ead74f0c5c527fe241f8f8c",
			emojis: [],
			premium_subscription_count: 14,
			roles: [],
			discovery_splash: null,
			default_message_notifications: 1,
			region: "deprecated",
			max_video_channel_users: 25,
			verification_level: 0,
			application_id: null,
			premium_progress_bar_enabled: false,
			banner: "a_a666ae551605a2d8cda0afd591c0af3a",
			features: [],
			vanity_url_code: null,
			hub_type: null,
			public_updates_channel_id: null,
			rules_channel_id: null,
			name: "Psychonauts 3",
			max_stage_video_channel_users: 300,
			system_channel_flags: 0|0
		}
	},
	message: {
		// Display order is text content, attachments, then stickers
		sticker: {
			id: "1106366167788044450",
			type: 0,
			content: "can have attachments too",
			channel_id: "122155380120748034",
			author: {
				id: "113340068197859328",
				username: "Cookie 🍪",
				global_name: null,
				display_name: null,
				avatar: "b48302623a12bc7c59a71328f72ccb39",
				discriminator: "7766",
				public_flags: 128,
				avatar_decoration: null
			},
			attachments: [{
				id: "1106366167486038016",
				filename: "image.png",
				size: 127373,
				url: "https://cdn.discordapp.com/attachments/122155380120748034/1106366167486038016/image.png",
				proxy_url: "https://media.discordapp.net/attachments/122155380120748034/1106366167486038016/image.png",
				width: 333,
				height: 287,
				content_type: "image/png"
			}],
			embeds: [],
			mentions: [],
			mention_roles: [],
			pinned: false,
			mention_everyone: false,
			tts: false,
			timestamp: "2023-05-11T23:44:09.690000+00:00",
			edited_timestamp: null,
			flags: 0,
			components: [],
			sticker_items: [{
				id: "1106323941183717586",
				format_type: 1,
				name: "pomu puff"
			}]
		 }
	}
}
