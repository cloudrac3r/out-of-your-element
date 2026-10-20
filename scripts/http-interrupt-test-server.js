// @ts-check

const net = require("net")
const stream = require("stream")
const {scheduler} = require("timers/promises")

const CHUNKED = true
const REPEAT_COUNT = 10

const b = new Uint8Array(1024).fill(0x65)

async function* createData() {
	for (let i = 0; i < REPEAT_COUNT; i++) {
		console.log(`generated chunk ${i}`)
		if (CHUNKED) {
			yield b.length.toString(16)
			yield "\r\n"
		}
		yield b
		if (CHUNKED) {
			yield "\r\n"
		}
		await scheduler.wait(800)
	}
	if (CHUNKED) {
		yield "0\r\n\r\n"
	}
}

const server = net.createServer(socket => {
	socket.write(`HTTP/1.1 200 OK\r\n`)
	socket.write("Connection: keep-alive\r\n")
	if (CHUNKED) {
		socket.write("Transfer-Encoding: chunked\r\n")
	} else {
		socket.write(`Content-Length: ${b.length*REPEAT_COUNT}\r\n`)
	}
	socket.write(`\r\n`)
	const dataStream = stream.Readable.from(createData())
	dataStream.pipe(socket)

	// In case of problem with dataStream
	dataStream.on("error", () => {
		console.error("aw dang it")
		socket.end()
	})

	// In case of problem with recipient
	socket.on("close", () => {
		console.log("socket close")
		dataStream.destroy()
	})

	socket.on("error", () => {
		console.log("socket error")
	})

	socket.on("end", () => {
		console.log("socket end")
	})
})

server.listen(6694)
