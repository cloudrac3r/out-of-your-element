// @ts-check

const h3 = require("h3")
const {defineEventHandler, getValidatedQuery, setResponseHeader} = h3
const sharp = require("sharp")
const {z} = require("zod")

const {as} = require("../../passthrough")
const {reg} = require("../../matrix/read-registration")

/*
	Create a 300x300 avatar image consisting of a dark coloured background, and a single character in a lighter colour centered in the middle.
	Note: Where dimensions are changed, font size must also be changed too to produce an identical image as before.
	Simply put, 100px = 60pt for font.
*/

const SIZE = 300
const POSSIBLE_HUES = 12

/** Helper function: To get accurate complimenting colours we need to work in HSL, then convert back to RGB at the end */
function hslToRgb(h, s, l) {
	s /= 100;
	l /= 100;

	const a = s * Math.min(l, 1 - l);

	const f = n => {
		const k = (n + h / 30) % 12;
		return l - a * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1));
	};

	return {
		r: Math.round(255 * f(0)),
		g: Math.round(255 * f(8)),
		b: Math.round(255 * f(4))
	};
}

/**
 * Use the MXID to generate deterministic avatar colours for each user.
 * Here, we use the string hash code as a hue value, with a 360 wrap modulo.
 * @param {string} mxid
 */
function mxidToHue(mxid) {
	// Element Classic string hasher
	let hash = 0;
	let i;
	let chr;
	if (mxid.length === 0) {
		return hash;
	}
	for (i = 0; i < mxid.length; i++) {
		chr = mxid.charCodeAt(i);
		hash = ((hash << 5) - hash) + chr;
		hash |= 0;
	}
	hash = Math.abs(hash)
	return (hash % POSSIBLE_HUES) * (360 / POSSIBLE_HUES)
}

/**
 * Get first useful character in username to put in the avatar.
 * @param {string} username
 */
function usernameToLetter(username) {
	return (username.match(/[a-z0-9]/i)?.[0] || "#").toUpperCase()
}

/**
 * @param {string} mxid
 * @param {string} username
 */
function getLetterAvatarURL(mxid, username) {
	const p = new URLSearchParams({letter: usernameToLetter(username), hue: String(mxidToHue(mxid))})
	return `${reg.ooye.bridge_origin}/download/letter-avatar?${p}`
}

const schema = {
	letterAvatar: z.object({
		hue: z.coerce.number().min(0).max(360),
		letter: z.string().regex(/^[A-Z0-9#]$/)
	})
}

/**
 * Produce a PNG letter-avatar from given parameters.
 * @param {string} letter
 * @param {number} hue
 */
as.router.get("/download/letter-avatar", defineEventHandler(async event => {
	const {letter, hue} = await getValidatedQuery(event, schema.letterAvatar.parse)

	const bg_rgb = hslToRgb(hue, 65, 18);
	const text_rgb = hslToRgb(hue, 70, 65);
	const text_rgbahex = `#${text_rgb.r.toString(16).padStart(2, "0")}${text_rgb.g.toString(16).padStart(2, "0")}${text_rgb.b.toString(16).padStart(2, "0")}ff`

	const streamOut = sharp({
		create: {
			width: SIZE, height: SIZE, channels: 4,
			background: {
				r: bg_rgb.r, g: bg_rgb.g, b: bg_rgb.b, alpha: 1
			}
		}
	}).composite([{
		input: {
			text: {
				text: `<span foreground="${text_rgbahex}">${letter}</span>`,
				font: "Noto Sans Bold 180", align: "center", rgba: true
			}
		}
	}]).png()

	setResponseHeader(event, "content-type", "image/png")
	return streamOut
}))

module.exports.getLetterAvatarURL = getLetterAvatarURL
