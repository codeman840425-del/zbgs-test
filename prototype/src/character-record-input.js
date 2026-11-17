import {isSafeCharacterRecordId} from './character-record.js';

// Only explicit package-local sidecars are accepted. A malformed external
// manifest never silently selects the bundled demonstration characters.
export function validateCharacterRecordInput(manifest, manifestPath) {
  if (manifestPath !== '/records/manifest.json') throw Error('Unsupported record manifest path');
  if (manifest?.schema !== 'character-record-input-v1' || !Array.isArray(manifest.entries) ||
      manifest.entries.length < 1 || manifest.entries.length > 4) throw Error('Invalid record input manifest');
  const ids = new Set();
  for (const entry of manifest.entries) {
    if (!isSafeCharacterRecordId(entry?.id) || entry.id === 'manifest' || ids.has(entry.id) ||
        entry.url !== '/records/' + entry.id + '.json' || typeof entry.recordSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.recordSha256))
      throw Error('Invalid or duplicate record input entry');
    ids.add(entry.id);
  }
  return manifest.entries;
}
