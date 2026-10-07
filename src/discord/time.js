// @ts-check

const assert = require("assert").strict

/*
	https://docs.discord.com/developers/reference#message-formatting

	Trying to make these formats fairly culture independent since the Matrix text will show up the same for everyone.
	That means no ambiguous short dates like 03/04/26. The shortest allowable date is "medium", which spells the month.
	It also means no 24-hour time, since this is ambiguous to 12-hour time users. Times must have am/pm.
	Relative time is not supported for text conversion and will fall back to the default, "f".

	See the test file for sample outputs.
*/

/** @type {Map<string, Intl.DateTimeFormatOptions>} discord style letter abbreviation -> Intl.DateTimeFormat constructor options */
const styles = new Map([
	["t", {timeStyle: "short", timeZone: "UTC"}],
	["T", {timeStyle: "medium", timeZone: "UTC"}],
	["d", {dateStyle: "medium", timeZone: "UTC"}],
	["D", {dateStyle: "long", timeZone: "UTC"}],
	["f", {dateStyle: "long", timeStyle: "short", timeZone: "UTC"}],
	["F", {dateStyle: "full", timeStyle: "short", timeZone: "UTC"}],
	["s", {dateStyle: "medium", timeStyle: "short", timeZone: "UTC"}],
	["S", {dateStyle: "medium", timeStyle: "medium", timeZone: "UTC"}]
])
const defaultStyle = "f"

/**
 * @param {string | null | undefined} [style]
 * @returns {Intl.DateTimeFormatOptions} */
function getFormatOptions(style) {
	if (!style || !styles.has(style)) style = defaultStyle
	const formatOptions = styles.get(style)
	assert(formatOptions)
	return formatOptions
}

/**
 * @param {number} timestamp unix time in seconds
 * @param {string | null | undefined} [style] discord style letter abbreviation, if present
 * @returns {string}
 */
function convertDiscordTime(timestamp, style) {
	const formatter = new Intl.DateTimeFormat("en-NZ", getFormatOptions(style))
	const d = new Date(timestamp * 1000)
	return formatter.format(d) + " (UTC)"
}

module.exports.getFormatOptions = getFormatOptions
module.exports.convertDiscordTime = convertDiscordTime
