// @ts-check

const fs = require("fs")
const {join} = require("path")
const s = fs.readFileSync(join(__dirname, "..", "src", "m2d", "converters", "emojis.txt"), "utf8").split("\n").map(x => encodeURIComponent(x))
const searchPattern = "%EF%B8%8F"

/**
 * adapted from es.map.group-by.js in core-js
 * @template K,V
 * @param {V[]} items
 * @param {(item: V) => K} fn
 * @returns {Map<K, V[]>}
 */
function groupBy(items, fn) {
	var map = new Map();
	for (const value of items) {
		var key = fn(value);
		if (!map.has(key)) map.set(key, [value]);
		else map.get(key).push(value);
	}
	return map;
}

/**
 * @param {number[]} items
 * @param {number} width
 */
function xhistogram(items, width) {
	const chars = " ▏▎▍▌▋▊▉"
	const max = items.reduce((a, c) => c > a ? c : a, 0)
	return items.map(v => {
		const p = v / max * (width-1)
		return (
			Array(Math.floor(p)).fill("█").join("") /* whole part */
			+ chars[Math.ceil((p % 1) * (chars.length-1))] /* decimal part */
		).padEnd(width)
	})
}

/**
 * @param {number[]} items
 * @param {[number, number]} xrange
 */
function yhistogram(items, xrange, printHeader = false) {
	const chars = "░▁_▂▃▄▅▆▇█"
	const ones = "₀₁₂₃₄₅₆₇₈₉"
	const tens = "0123456789"
	const xy = []
	let max = 0
	/** value (x) -> frequency (y) */
	const grouped = groupBy(items, x => x)
	for (let i = xrange[0]; i <= xrange[1]; i++) {
		if (printHeader) {
			if (i === -1) process.stdout.write("-")
			else if (i.toString().at(-1) === "0") process.stdout.write(tens[i/10])
			else process.stdout.write(ones[i%10])
		}
		const y = grouped.get(i)?.length ?? 0
		if (y > max) max = y
		xy.push(y)
	}
	if (printHeader) console.log()
	return xy.map(y => chars[Math.ceil(y / max * (chars.length-1))]).join("")
}

const grouped = groupBy(s, x => x.length)
const sortedGroups = [...grouped.entries()].sort((a, b) => b[0] - a[0])
let length = 0
const lengthHistogram = xhistogram(sortedGroups.map(v => v[1].length), 10)
for (let i = 0; i < sortedGroups.length; i++) {
	const [k, v] = sortedGroups[i]
	const l = lengthHistogram[i]
	const h = yhistogram(v.map(x => x.indexOf(searchPattern)), [-1, k - searchPattern.length], i === 0)
	if (i === 0) length = h.length + 1
	console.log(`${h.padEnd(length, i % 2 === 0 ? "⸱" : " ")}length ${k.toString().padEnd(3)} ${l} ${v.length}`)
}
