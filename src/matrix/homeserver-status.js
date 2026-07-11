// @ts-check

const assert = require("assert")
const Denque = require("denque")
const StateMachine = require("snowtransfer").StateMachine

const passthrough = require("../passthrough")
const {sync} = passthrough
/** @type {import("../d2m/discord-packets")} */
const discordPackets = sync.require("../d2m/discord-packets")
/** @type {import("../matrix/api")} */
const api = sync.require("../matrix/api")

const DEBUG_HOMESERVER_STATUS = true

function debugHomeserverStatus(message) {
	if (DEBUG_HOMESERVER_STATUS) {
		console.log(message)
	}
}

const homeserverStatus = new class HomeserverStatus {
	constructor() {
		/** @private */
		this.queue = new Denque()

		/** @private */
		this.pingInterval = undefined

		/** @private */
		this.sm = new StateMachine("online")
			.defineState("online")

			.defineState("offline", {
				onEnter: [() => {
					this.pingInterval = setInterval(async () => {
						const pingResult = await api.ping().catch(e => ({ok: false, status: "net", root: e.message}))
						if (pingResult.ok) {
							this.sm.doTransition("ping ok")
						}
					}, 15e3)
				}],
				onLeave: [() => {
					clearInterval(this.pingInterval)
				}],
				transitions: new Map()
			})

			.defineState("recovering", {
				onEnter: [async () => { // Drain queue.
					while (!this.queue.isEmpty()) {
						const packet = this.queue.peekFront() // same position as .shift()
						debugHomeserverStatus(`homeserver status: ${new Date().toISOString()} dq packet ${packet.t} ${packet.d?.content}`)
						await discordPackets.dispatchPacketToBridge(passthrough.discord, packet)
						if (this.sm.currentStateName !== "recovering") return // got kicked out due to another error
						this.queue.shift()
					}
					this.sm.doTransition("recovered")
				}],
				onLeave: [],
				transitions: new Map()
			})

			.defineUniversalTransition("error", "offline")
			.defineTransition("offline", "ping ok", "recovering")
			.defineTransition("recovering", "recovered", "online")

		this.sm.on("enter", st => debugHomeserverStatus(`homeserver status: ${st}`))

		this.sm.freeze()
	}

	isRealTime() {
		return this.sm.currentStateName === "online"
	}

	/**
	 * When offline or recovering, call this for incoming packets to queue them to be sent in order later.
	 */
	queuePacket(packet) {
		assert(["offline", "recovering"].includes(this.sm.currentStateName))
		this.queue.push(packet)
	}

	setErrorWithPacket(packet) {
		const wasRecovering = this.sm.currentStateName === "recovering"
		this.sm.doTransition("error")
		if (!wasRecovering) { // if was recovering then packet is already in the right place in queue
			this.queuePacket(packet)
		}
	}
}

module.exports.homeserverStatus = homeserverStatus
