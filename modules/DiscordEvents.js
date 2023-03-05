module.exports = {
	/**
	 * Process Discord messages and convert to a message Matrix can understand
	 *
	 * @param {import("./DiscordClient")} client
	 * @param {import("discord-api-types/v10").APIMessage} message
	 * @returns {import("../types").MatrixMessage}
	 */
	onMessageCreate(client, message) {
		return {}
	}
}
