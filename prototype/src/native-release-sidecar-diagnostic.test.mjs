import test from 'node:test';
import assert from 'node:assert/strict';
import manifest from '../../evidence/m2-native-release-sidecar-v1/manifest.json' with {type: 'json'};
import {runNativeReleaseSidecarDiagnostic} from './native-release-sidecar-diagnostic.js';

const entry = manifest.entries[0];

function material() {
  return {
    name: entry.target.materialName,
    map: {id: 'original-map'},
    shadeMultiplyTexture: {id: 'original-shade'},
    alphaTest: entry.target.materialContract.alphaCutoff,
    transparent: false,
    update() {},
  };
}

test('diagnostic resolves exact body, exercises KTX2, PNG fallback, failure preservation and reopen', async () => {
  const source = material();
  const loaded = [];
  let calls = 0;
  const loadCandidate = async (_url, options) => {
    calls += 1;
    if (options.failureProbe) throw new Error('simulated KTX2 decode failure');
    const texture = {width: 2048, height: 2048, id: `candidate-${calls}`, dispose() { loaded.push(this.id); }};
    return texture;
  };
  const loadFallback = async (_url, options) => {
    assert(options.reason === 'candidate-load-failed');
    return {id: 'fallback-png', dispose() { loaded.push(this.id); }};
  };
  const result = await runNativeReleaseSidecarDiagnostic({
    manifest,
    bodyType: entry.bodyType,
    bodySha256: entry.sourceModelSha256,
    material: source,
    loadCandidate,
    loadFallback,
  });
  assert.deepEqual(result.checks, {
    exactBodySha: true,
    materialContract: true,
    pngFallback: true,
    candidateLoad: true,
    loadFailurePreservesOld: true,
    closeReopen: true,
  });
  assert.equal(result.runtimeAdmissionChanged, false);
  assert.equal(result.materialApplied, false);
  assert.equal(result.restoredOriginalMaterial, true);
  assert.equal(calls, 3);
  assert.deepEqual(loaded, ['candidate-1', 'candidate-2', 'fallback-png']);
  assert.equal(source.map.id, 'original-map');
  assert.equal(source.shadeMultiplyTexture.id, 'original-shade');
});

test('diagnostic returns PNG fallback for an unregistered body without touching material', async () => {
  const source = material();
  let requested = 0;
  const result = await runNativeReleaseSidecarDiagnostic({
    manifest,
    bodyType: entry.bodyType,
    bodySha256: '0'.repeat(64),
    material: source,
    loadFallback: async (url, options) => {
      requested += 1;
      assert.equal(url, null);
      assert.equal(options.reason, 'No exact body sidecar');
      return {id: 'original-vrm-png', dispose() {}};
    },
  });
  assert.equal(result.resolution.status, 'fallback-png');
  assert.equal(result.checks.pngFallback, true);
  assert.equal(requested, 1);
  assert.equal(source.map.id, 'original-map');
});

test('diagnostic rejects a material with transparent alpha state', async () => {
  const source = material();
  source.transparent = true;
  await assert.rejects(runNativeReleaseSidecarDiagnostic({
    manifest,
    bodyType: entry.bodyType,
    bodySha256: entry.sourceModelSha256,
    material: source,
    loadCandidate: async () => ({width: 2048, height: 2048}),
    loadFallback: async () => ({id: 'fallback'}),
  }), /alpha\/transparent contract differs/);
});

