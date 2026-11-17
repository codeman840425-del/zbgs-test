# D01 character record source module

`prototype/src/character-record.js` defines the pure `character-record-v1` envelope. It preserves the complete existing v6-v9 appearance recipe under `appearanceRecipe`, while keeping identity `{id,name,gender}` separate from body data. It computes deterministic canonical JSON hashes with WebCrypto SHA-256. `integrity.recipeSha256` hashes the complete recipe and `integrity.recordSha256` hashes the record with only that field omitted.

`createCharacterRecord` and `updateCharacterRecord` require an explicit async resource validation callback before returning. The callback may return `passed` or `pending`. The CLI uses `pending` and therefore reports structural/hash validation only. It never claims that resources load, fit, or pass runtime admission. `updateCharacterRecord` uses revision/CAS and preserves the original identity and creation timestamp.

`scripts/character-record-store.mjs` requires an explicit absolute root. It writes a temporary file and renames it atomically. New records cannot overwrite a different existing record. Same-byte duplicate creation leaves mtime unchanged. Updates require the expected revision. The store does not scan outside the specified root.

The test command is `node scripts/test-character-record.mjs`. It covers malformed IDs, callback requirements, same base with two identities, revision conflicts, duplicate writes, corrupted JSON, atomic updates, and pending CLI-style validation. The test uses a temporary directory and does not touch project records.
