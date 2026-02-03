// @ts-check

const assert = require("assert")

const {reg} = require("../../matrix/read-registration")
const userRegex = reg.namespaces.users.map(u => new RegExp(u.regex))

/**
 * @typedef {{text: string, index: number, end: number}} Token
 */

/** @typedef {{mxids: {localpart: string, mxid: string, displayname?: string}[], names: {displaynameTokens: Token[], mxid: string}[]}} ProcessedJoined */

const lengthBonusLengthCap = 50
const lengthBonusValue = 0.5
/**
 * Score by how many characters in a row at the start of input are in localpart. 2x if it matches at the start. +1 tiebreaker bonus if it matches all.
 * 0 = no match
 * @param {string} localpart
 * @param {string} input
 * @param {string} [displayname] only for the super tiebreaker
 * @returns {{score: number, matchedInputTokens: Token[]}}
 */
function scoreLocalpart(localpart, input, displayname) {
	let score = 0
	let atStart = false
	let matchingLocations = []
	do {
		atStart = matchingLocations[0] === 0
		let chars = input[score]
		if (score === 0) {
			// add all possible places
			let i = 0
			while ((i = localpart.indexOf(chars, i)) !== -1) {
				matchingLocations.push(i)
				i++
			}
		} else {
			// trim down remaining places
			matchingLocations = matchingLocations.filter(i => localpart[i+score] === input[score])
		}
		if (matchingLocations.length) {
			score++
			if (score === localpart.length) break
		}
	} while (matchingLocations.length)
	/** @type {Token} */
	const fakeToken = {text: input.slice(0, score), index: 0, end: score}
	const displaynameLength = displayname?.length ?? 0
	if (score === localpart.length) score = score * 2 + 1 + Math.max(((lengthBonusLengthCap-displaynameLength)/lengthBonusLengthCap)*lengthBonusValue, 0)
	else if (atStart) score = score * 2
	return {score, matchedInputTokens: [fakeToken]}
}

const decayDistance = 10
const decayValue = 0.33
/**
 * Score by how many tokens in sequence (not necessarily back to back) at the start of input are in display name tokens. Score each token on its length. 2x if it matches at the start. +1 tiebreaker bonus if it matches all
 * @param {Token[]} displaynameTokens
 * @param {Token[]} inputTokens
 * @returns {{score: number, matchedInputTokens: Token[]}}
 */
function scoreName(displaynameTokens, inputTokens) {
	let matchedInputTokens = []
	let score = 0
	let searchFrom = 0
	for (let nextInputTokenIndex = 0; nextInputTokenIndex < inputTokens.length; nextInputTokenIndex++) {
		// take next
		const nextToken = inputTokens[nextInputTokenIndex]
		// see if it's there
		let foundAt = displaynameTokens.findIndex((tk, idx) => idx >= searchFrom && tk.text === nextToken.text)
		if (foundAt !== -1) {
			// update scoring
			matchedInputTokens.push(nextToken)
			score += nextToken.text.length * Math.max(((decayDistance-foundAt)*(1+decayValue))/(decayDistance*(1+decayValue)), decayValue) // decay score 100%->33% the further into the displayname it's found
			// prepare for next loop
			searchFrom = foundAt + 1
		} else {
			break
		}
	}
	const firstTextualInputToken = inputTokens.find(t => t.text.match(/^\w/))
	if (matchedInputTokens[0] === inputTokens[0] || matchedInputTokens[0] === firstTextualInputToken) score *= 2
	if (matchedInputTokens.length === displaynameTokens.length) score += 1
	return {score, matchedInputTokens}
}

/**
 * @param {string} name
 * @returns {Token[]}
 */
function tokenise(name) {
	let index = 0
	let result = []
	for (const part of name.split(/(_|\s|\b)/g)) {
		if (part.trim()) {
			result.push({text: part.toLowerCase(), index, end: index + part.length})
		}
		index += part.length
	}
	return result
}

/**
 * @param {{mxid: string, displayname?: string}[]} joined
 * @returns {ProcessedJoined}
 */
function processJoined(joined) {
	joined = joined.filter(j => !userRegex.some(rx => j.mxid.match(rx)))
	return {
		mxids: joined.map(j => {
			const localpart = j.mxid.match(/@([^:]*)/)
			assert(localpart)
			return {
				localpart: localpart[1].toLowerCase(),
				mxid: j.mxid,
				displayname: j.displayname
			}
		}),
		names: joined.filter(j => j.displayname).map(j => {
			return {
				displaynameTokens: tokenise(j.displayname),
				mxid: j.mxid
			}
		})
	}
}

/**
 * @param {ProcessedJoined} pjr
 * @param {string} maximumWrittenSection lowercase please
 * @param {string} content
 */
function findMention(pjr, maximumWrittenSection, baseOffset, prefix, content) {
	if (!pjr.mxids.length && !pjr.names.length) return
	const maximumWrittenSectionTokens = tokenise(maximumWrittenSection)
	/** @type {{mxid: string, scored: {score: number, matchedInputTokens: Token[]}}[]} */
	let allItems = pjr.mxids.map(mxid => ({...mxid, scored: scoreLocalpart(mxid.localpart, maximumWrittenSection, mxid.displayname)}))
	allItems = allItems.concat(pjr.names.map(name => ({...name, scored: scoreName(name.displaynameTokens, maximumWrittenSectionTokens)})))
	const best = allItems.sort((a, b) => b.scored.score - a.scored.score)[0]
	if (best.scored.score > 4) { // requires in smallest case perfect match of 2 characters, or in largest case a partial middle match of 5+ characters in a row
		// Highlight the relevant part of the message
		const start = baseOffset + best.scored.matchedInputTokens[0].index
		const end = baseOffset + prefix.length + best.scored.matchedInputTokens.at(-1).end
		const newContent = content.slice(0, start) + "[" + content.slice(start, end) + "](https://matrix.to/#/" + best.mxid + ")" + content.slice(end)
		return {
			mxid: best.mxid,
			newContent
		}
	}
}

module.exports.scoreLocalpart = scoreLocalpart
module.exports.scoreName = scoreName
module.exports.tokenise = tokenise
module.exports.processJoined = processJoined
module.exports.findMention = findMention
