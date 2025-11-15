// @ts-check

const Ty = require("../src/types")
const fs = require("fs")
const domino = require("domino")
const repl = require("repl")

const pres = (() => {
	const pres = []
	for (const file of process.argv.slice(2)) {
		const data = JSON.parse(fs.readFileSync(file, "utf8"))
		/** @type {Ty.Event.Outer<{msgtype?: string}>[]} */
		const events = data.messages
		for (const event of events) {
			if (event.type !== "m.room.message" || event.content.msgtype !== "m.text") continue
			/** @type {Ty.Event.M_Room_Message} */ // @ts-ignore
			const content = event.content
			if (content.format !== "org.matrix.custom.html") continue
			if (!content.formatted_body) continue

			const document = domino.createDocument(content.formatted_body)
			// @ts-ignore
			for (const pre of document.querySelectorAll("pre").cache) {
				const content = pre.textContent
				if (content.length < 100) continue
				pres.push(content)
			}
		}
	}
	return pres
})()

// @ts-ignore
global.gc()

/** @param {string} text */
function probablyFixedWidthIntended(text) {
	// if internal spaces are used, seems like they want a fixed-width font
	if (text.match(/[^ ] {3,}[^ ]/)) return true
	// if characters from Unicode General_Category "Symbol, other" are used, seems like they're doing ascii art and they want a fixed-width font
	if (text.match(/\p{So}/v)) return true
	// check start of line indentation
	let indents = new Set()
	for (const line of text.trimEnd().split("\n")) {
		indents.add(line.match(/^ */)?.[0].length || 0)
		// if there are more than 3 different indents (counting 0) then it's code
		if (indents.size >= 3) return true
	}
	// if everything is indented then it's code
	if (!indents.has(0)) return true
	// if there is a high proportion of symbols then it's code (this filter works remarkably well on its own)
	if ([...text.matchAll(/[\\`~;+|<>%$@*&"'=(){}[\]_^]|\.[a-zA-Z]|[a-z][A-Z]/g)].length / text.length >= 0.04) return true
	return false
}

Object.assign(repl.start().context, {pres, probablyFixedWidthIntended})

/*
if it has a lot of symbols then it's code
if it has >=3 levels of indentation then it's code
if it is all indented then it's code
if it has many spaces in a row in the middle then it's ascii art
if it has many non-latin characters then it's language
-> except if they are ascii art characters e.g. ⣿⣿⡇⢸⣿⠃ then it's ascii art
*/
