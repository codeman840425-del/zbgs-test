// Focused source test entry. The complete filesystem/CAS test is scripts/test-character-record.mjs.
import assert from 'node:assert/strict';
import { canonicalJson } from './character-record.js';
assert.equal(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
console.log('character-record canonicalization ok');
