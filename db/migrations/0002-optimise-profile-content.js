module.exports = async function(db) {
	const hasher = await require("xxhash-wasm")()
	const contents = db.prepare("SELECT distinct hashed_profile_content FROM sim_member").pluck().all()
	const stmt = db.prepare("UPDATE sim_member SET hashed_profile_content = ? WHERE hashed_profile_content = ?")
	db.transaction(() => {
		for (const s of contents) {
			if (!Buffer.isBuffer(s)) s = Buffer.from(s)
			const unsignedHash = hasher.h64(eventID)
			const signedHash = unsignedHash - 0x8000000000000000n // shifting down to signed 64-bit range
			stmt.run(s, signedHash)
		}
	})()
}
