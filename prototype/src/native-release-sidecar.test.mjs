import test from 'node:test';
import assert from 'node:assert/strict';
import manifest from '../../evidence/m2-native-release-sidecar-v1/manifest.json' with { type: 'json' };
import { resolveNativeReleaseSidecar } from './native-release-sidecar.js';

const body = manifest.entries[0];

test('resolves only exact candidate sidecar and preserves PNG fallback', () => {
  const result = resolveNativeReleaseSidecar(manifest, body.bodyType, body.sourceModelSha256);
  assert.equal(result.status, 'candidate-only');
  assert.equal(result.fallbackPng, body.fallbackPng);
  assert.equal(result.target.materialName, 'N00_000_00_Body_00_SKIN (Instance)');
  assert.equal(result.target.materialContract.alphaMode, 'MASK');
});

test('falls back when body identity is not registered', () => {
  const result = resolveNativeReleaseSidecar(manifest, body.bodyType, '0'.repeat(64));
  assert.equal(result.status, 'fallback-png');
});

test('rejects malformed candidate identity', () => {
  assert.throws(() => resolveNativeReleaseSidecar(manifest, body.bodyType, 'bad'), /incomplete/);
});

test('rejects a candidate with a missing material target contract', () => {
  const malformed = structuredClone(manifest);
  delete malformed.entries[0].target.materialName;
  assert.throws(() => resolveNativeReleaseSidecar(malformed, body.bodyType, body.sourceModelSha256), /material target contract/);
});

test('rejects a candidate whose alpha or source-image contract drifts', () => {
  for (const mutate of [
    value => { value.entries[0].target.materialContract.alphaCutoff = 0.25; },
    value => { value.entries[0].target.materialContract.texCoord = 1; },
    value => { value.entries[0].target.materialContract.sourceImageSha256 = '0'.repeat(64); },
  ]) {
    const malformed = structuredClone(manifest);
    mutate(malformed);
    assert.throws(() => resolveNativeReleaseSidecar(malformed, body.bodyType, body.sourceModelSha256), /material target contract/);
  }
});
