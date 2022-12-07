module.exports = {
	/**
	 * Process Discord messages and convert to a message Matrix can understand
	 *
	 * @param {import("discord-typings").Message} message
	 * @returns {import("../types").MatrixMessage}
	 */
	onMessageCreate: message => {
		return {}
	}
}
