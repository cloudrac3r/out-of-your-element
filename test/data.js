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
			"m.room.topic/": {topic: "#collective-unconscious | https://docs.google.com/document/d/blah/edit | I spread, pipe, and whip because it is my will. :headstone:\n\nChannel ID: 112760669178241024\nGuild ID: 112760669178241024"},
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
				type: 2,
				tags: "sunglasses",
				name: "pomu puff",
				id: "1106323941183717586",
				guild_id: "112760669178241024",
				format_type: 1,
				description: "damn that tiny lil bitch really chuffing. puffing that fat ass dart",
				available: true
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
	member: {
		sheep: {
			avatar: "38dd359aa12bcd52dd3164126c587f8c",
			communication_disabled_until: null,
			flags: 0,
			joined_at: "2020-10-14T22:08:37.804000+00:00",
			nick: "The Expert's Submarine",
			pending: false,
			premium_since: "2022-05-04T00:28:44.326000+00:00",
			roles: [
				"112767366235959296",  "118924814567211009",
				"118923488755974146",  "199995902742626304",
				"204427286542417920",  "217013981053845504",
				"222168467627835392",  "260993819204386816",
				"265239342648131584",  "271173313575780353",
				"225744901915148298",  "287733611912757249",
				"318243902521868288",  "348651574924541953",
				"352291384021090304",  "378402925128712193",
				"392141548932038658",  "393912152173576203",
				"1123460940935991296", "872274377150980116",
				"373336013109461013",  "530220455085473813",
				"768280323829137430",  "842343433452257310",
				"454567553738473472",  "920107226528612383",
				"1123528381514911745", "1040735082610167858",
				"585531096071012409",  "849737964090556488",
				"660272211449479249"
			],
			user: {
				id: "134826546694193153",
				username: "aprilsong",
				avatar: "c754c120bce07ae3b3130e2b0e61d9dd",
				discriminator: "0",
				public_flags: 640,
				flags: 640,
				banner: "a3ad0693213f9dbf793b4159dbae0717",
				accent_color: null,
				global_name: "sheep",
				avatar_decoration: null,
				display_name: "sheep",
				banner_color: null
			},
			mute: false,
			deaf: false
		}
	},
	message: {
		// Display order is text content, attachments, then stickers
		attachment_no_content: {
			id: "1124628646670389348",
			type: 0,
			content: "",
			channel_id: "497161332244742154",
			author: {
				id: "320067006521147393",
				username: "papiophidian",
				global_name: "PapiOphidian",
				avatar: "fb2b4535f7a108619e3edae12fcb16c5",
				discriminator: "0",
				public_flags: 4194880,
				avatar_decoration: null
			},
			attachments: [
				{
					id: "1124628646431297546",
					filename: "image.png",
					size: 12919,
					url: "https://cdn.discordapp.com/attachments/497161332244742154/1124628646431297546/image.png",
					proxy_url: "https://media.discordapp.net/attachments/497161332244742154/1124628646431297546/image.png",
					width: 466,
					height: 85,
					content_type: "image/png"
				}
			],
			embeds: [],
			mentions: [],
			mention_roles: [],
			pinned: false,
			mention_everyone: false,
			tts: false,
			timestamp: "2023-07-01T09:12:43.956000+00:00",
			edited_timestamp: null,
			flags: 0,
			components: []
		},
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
