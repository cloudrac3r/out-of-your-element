/**
 * This function is adapted from Evan Kaufman's fantastic work.
 * The original function and my adapted function are both MIT licensed.
 * @url https://github.com/EvanK/npm-loggable-error/
 * @param {number} [depth]
 * @returns {string}
*/
function stringifyErrorStack(err, depth = 0) {
	let collapsed = " ".repeat(depth);
	if (!(err instanceof Error)) {
		return collapsed + err
	}

	// add full stack trace if one exists, otherwise convert to string
	let stackLines = String(err?.stack ?? err).replace(/^/gm, " ".repeat(depth)).trim().split("\n")
	let cloudstormLine = stackLines.findIndex(l => l.includes("/node_modules/cloudstorm/"))
	if (cloudstormLine !== -1) {
		stackLines = stackLines.slice(0, cloudstormLine - 2)
	}
	collapsed += stackLines.join("\n")

	const props = Object.getOwnPropertyNames(err).filter(p => !["message", "stack"].includes(p))

	// only break into object notation if we have additional props to dump
	if (props.length) {
		const dedent = " ".repeat(depth);
		const indent = " ".repeat(depth + 2);

		collapsed += " {\n";

		// loop and print each (indented) prop name
		for (let property of props) {
			collapsed += `${indent}[${property}]: `;

			// if another error object, stringify it too
			if (err[property] instanceof Error) {
				collapsed += stringifyErrorStack(err[property], depth + 2).trimStart();
			}
			// otherwise stringify as JSON
			else {
				collapsed += JSON.stringify(err[property]);
			}

			collapsed += "\n";
		}

		collapsed += `${dedent}}\n`;
	}

	return collapsed;
}

module.exports.stringifyErrorStack = stringifyErrorStack
