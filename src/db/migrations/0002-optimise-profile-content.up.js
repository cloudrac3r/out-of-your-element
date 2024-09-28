module.exports = async function(db) {
	const hasher = await require("xxhash-wasm")()
	const contents = db.prepare("SELECT distinct hashed_profile_content FROM sim_member WHERE hashed_profile_content IS NOT NULL").pluck().all()
	const stmt = db.prepare("UPDATE sim_member SET hashed_profile_content = ? WHERE hashed_profile_content = ?")
	db.transaction(() => {
		/* c8 ignore next 6 */
		for (let s of contents) {
			let b = Buffer.isBuffer(s) ? Uint8Array.from(s) : Uint8Array.from(Buffer.from(s))
			const unsignedHash = hasher.h64Raw(b)
			const signedHash = unsignedHash - 0x8000000000000000n // shifting down to signed 64-bit range
			stmt.run(signedHash, s)
		}
	})()
}
