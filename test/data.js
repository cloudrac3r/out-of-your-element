// @ts-check

const DiscordTypes = require("discord-api-types/v10")

module.exports = {
	channel: {
		general: {
			type: 0,
			topic: 'https://docs.google.com/document/d/blah/edit | I spread, pipe, and whip because it is my will. :headstone:',
			rate_limit_per_user: 0,
			position: 0,
			permission_overwrites: [],
			parent_id: null,
			nsfw: false,
			name: 'collective-unconscious' ,
			last_pin_timestamp: '2023-04-06T09:51:57+00:00',
			last_message_id: '1103832925784514580',
			id: '112760669178241024',
			default_thread_rate_limit_per_user: 0,
			guild_id: '112760669178241024'
		}
	},
	room: {
		general: {
			"m.room.name/": {name: "collective-unconscious"},
			"m.room.topic/": {topic: "https://docs.google.com/document/d/blah/edit | I spread, pipe, and whip because it is my will. :headstone:"},
			"m.room.guest_access/": {guest_access: "can_join"},
			"m.room.history_visibility/": {history_visibility: "invited"},
			"m.space.parent/!jjWAGMeQdNrVZSSfvz:cadence.moe": {
				via: ["cadence.moe"], // TODO: put the proper server here
				canonical: true
			},
			"m.room.join_rules/": {
				join_rule: "restricted",
				allow: [{
					type: "m.room.membership",
					room_id: "!jjWAGMeQdNrVZSSfvz:cadence.moe"
				}]
			},
			"m.room.avatar/": {
				discord_path: "/icons/112760669178241024/a_f83622e09ead74f0c5c527fe241f8f8c.png?size=1024",
				url: "mxc://cadence.moe/sZtPwbfOIsvfSoWCWPrGnzql"
			}
		}
	},
	guild: {
		general: {
			owner_id: '112760500130975744',
			premium_tier: 3,
			stickers: [],
			max_members: 500000,
			splash: '86a34ed02524b972918bef810087f8e7',
			explicit_content_filter: 0,
			afk_channel_id: null,
			nsfw_level: 0,
			description: null,
			preferred_locale: 'en-US',
			system_channel_id: '112760669178241024',
			mfa_level: 0,
			/** @type {300} */
			afk_timeout: 300,
			id: '112760669178241024',
			icon: 'a_f83622e09ead74f0c5c527fe241f8f8c',
			emojis: [],
			premium_subscription_count: 14,
			roles: [],
			discovery_splash: null,
			default_message_notifications: 1,
			region: 'deprecated',
			max_video_channel_users: 25,
			verification_level: 0,
			application_id: null,
			premium_progress_bar_enabled: false,
			banner: 'a_a666ae551605a2d8cda0afd591c0af3a',
			features: [],
			vanity_url_code: null,
			hub_type: null,
			public_updates_channel_id: null,
			rules_channel_id: null,
			name: 'Psychonauts 3',
			max_stage_video_channel_users: 300,
			system_channel_flags: 0|0
		}
	}
}