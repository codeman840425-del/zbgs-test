import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { createKtxPilotAdapter } from './runtime-adapter.mjs';

const manifest = JSON.parse(await readFile(new URL('../../assets-source/m2-ktx-pilot-v1/manifest.json', import.meta.url)));
const sha = async bytes => Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
const results = [];
async function test(name, operation) {
  await operation(); results.push({ name, passed: true });
}

async function fixture({ failedImage, badSha, failedDecoder, delayed, wrongDimensions } = {}) {
  const sourceManifest = structuredClone(manifest);
  const samples = sourceManifest.samples.filter(sample => sample.gender === 'male');
  const bytesByUrl = new Map();
  const scene = new THREE.Group();
  const originals = [];
  for (const sample of samples) {
    const bytes = Uint8Array.of(sample.imageIndex);
    sample.encoded.sha256 = await sha(bytes);
    bytesByUrl.set(new URL(sample.encoded.path, 'https://pilot.test/').href, bytes);
    const texture = new THREE.Texture({ width: sample.width, height: sample.height });
    texture.flipY = false; texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    const material = new THREE.MeshBasicMaterial({ map: texture });
    material.shadeMultiplyTexture = texture;
    material.name = sample.materialUses[0].name;
    scene.add(new THREE.Mesh(new THREE.BufferGeometry(), material));
    originals.push({ material, texture });
  }
  if (badSha) samples.find(sample => sample.imageIndex === 9).encoded.sha256 = '0'.repeat(64);
  const decoderManifest = { threeVersion: '0.187.0', files: [] };
  for (const name of ['basis_transcoder.js', 'basis_transcoder.wasm']) {
    const bytes = Uint8Array.of(name.length, 42);
    decoderManifest.files.push({ name, sha256: failedDecoder ? '0'.repeat(64) : await sha(bytes), mimeType: 'application/octet-stream' });
    bytesByUrl.set('https://pilot.test/decoder/' + name, bytes);
  }
  let parseCount = 0, released = false, release;
  const gate = delayed ? new Promise(resolve => { release = resolve; }) : Promise.resolve();
  const produced = [];
  class Loader {
    constructor(manager) { this.manager = manager; }
    setTranscoderPath(path) { this.path = path; return this; }
    setWorkerLimit() { return this; }
    detectSupport() { return this; }
    async init() {
      for (const descriptor of decoderManifest.files)
        assert.match(this.manager.resolveURL(this.path + descriptor.name), /^blob:/);
    }
    parse(buffer, resolve, reject) {
      parseCount++;
      const imageIndex = new Uint8Array(buffer)[0];
      if (imageIndex === failedImage) { reject(Error('forced decode failure')); return; }
      const sample = samples.find(value => value.imageIndex === imageIndex);
      const texture = new THREE.CompressedTexture([{ data: new Uint8Array(16), width: sample.width, height: sample.height }],
        wrongDimensions ? 3 : sample.width, sample.height, THREE.RGBA_S3TC_DXT5_Format);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.addEventListener('dispose', () => { texture.disposedForCheck = true; });
      produced.push(texture); resolve(texture);
    }
    dispose() { released = true; }
  }
  const appearanceState = { hairColor: 'original', hairStyle: 'original' };
  const options = {
    THREE, KTX2Loader: Loader, renderer: {}, vrm: { scene }, bodyType: 'male',
    avatarSha256: samples[0].sourceModelSha256, appearance: { getState: () => ({ ...appearanceState }) },
    sourceManifest, sourceBaseUrl: 'https://pilot.test/', transcoderPath: 'https://pilot.test/decoder/', decoderManifest,
    fetchImpl: async url => {
      if (delayed && url.includes('encoded')) await gate;
      const bytes = bytesByUrl.get(url);
      return { ok: Boolean(bytes), status: bytes ? 200 : 404,
        arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
    },
  };
  return { adapter: createKtxPilotAdapter(options), options, originals, appearanceState,
    release: () => release?.(), produced, get parseCount() { return parseCount; }, get released() { return released; } };
}

await test('prepare keeps exact original map/shade until explicit apply', async () => {
  const f = await fixture(); assert.equal((await f.adapter.prepare()).prepared, true);
  for (const { material, texture } of f.originals) assert.equal(material.map, texture);
  assert.equal(f.adapter.applyOriginalKtx().applied, true);
  for (const { material, texture } of f.originals) {
    assert.notEqual(material.map, texture); assert.equal(material.map, material.shadeMultiplyTexture);
    assert.equal(material.map.minFilter, texture.minFilter); assert.equal(material.map.wrapS, texture.wrapS);
  }
  f.adapter.restorePng();
  for (const { material, texture } of f.originals) assert.equal(material.map, texture);
  assert.equal(f.adapter.snapshot().requests.length, 4); assert.equal(f.released, true);
  f.adapter.dispose();
});
await test('bad KTX SHA refuses parse and preserves original maps', async () => {
  const f = await fixture({ badSha: true }); assert.equal((await f.adapter.prepare()).prepared, false);
  for (const { material, texture } of f.originals) assert.equal(material.map, texture);
  assert.equal(f.produced.length, 1); assert.equal(f.produced[0].disposedForCheck, true); f.adapter.dispose();
});
await test('one decoded sample failure cleans successful peer without map mutation', async () => {
  const f = await fixture({ failedImage: 9 }); assert.equal((await f.adapter.prepare()).prepared, false);
  for (const { material, texture } of f.originals) assert.equal(material.map, texture);
  assert.equal(f.produced[0].disposedForCheck, true); f.adapter.dispose();
});
await test('bad decoder SHA prevents every KTX parse', async () => {
  const f = await fixture({ failedDecoder: true }); assert.equal((await f.adapter.prepare()).prepared, false);
  assert.equal(f.parseCount, 0); f.adapter.dispose();
});
await test('dimension mismatch refuses all replacement', async () => {
  const f = await fixture({ wrongDimensions: true }); assert.equal((await f.adapter.prepare()).prepared, false);
  for (const { material, texture } of f.originals) assert.equal(material.map, texture);
  f.adapter.dispose();
});
await test('dispose during deferred KTX fetch rejects late prepare and apply', async () => {
  const f = await fixture({ delayed: true }); const pending = f.adapter.prepare();
  await new Promise(resolve => setTimeout(resolve, 0)); f.adapter.dispose(); f.release();
  assert.equal((await pending).prepared, false); assert.equal(f.adapter.applyOriginalKtx().applied, false);
  for (const { material, texture } of f.originals) assert.equal(material.map, texture);
});
await test('tinted hair refuses full KTX and bodyOnly preserves the hair map', async () => {
  const f = await fixture(); await f.adapter.prepare(); f.appearanceState.hairColor = 'brown';
  assert.equal(f.adapter.applyOriginalKtx().applied, false);
  assert.equal(f.adapter.applyOriginalKtx({ bodyOnly: true }).applied, true);
  assert.equal(f.originals[1].material.map, f.originals[1].texture); f.adapter.dispose();
});
await test('Canvas callback gets exact PNG and a failed callback leaves explicit PNG fallback', async () => {
  const f = await fixture(); await f.adapter.prepare(); f.adapter.applyOriginalKtx();
  const result = await f.adapter.withCanvasAppearance(async () => {
    for (const { material, texture } of f.originals) assert.equal(material.map, texture);
    return { applied: false, reason: 'forced existing appearance rejection' };
  });
  assert.equal(result.applied, false); assert.equal(result.pilotFallback, 'original-png-or-existing-canvas');
  assert.ok(f.adapter.snapshot().materials.every(record => record.mapMode === 'png')); f.adapter.dispose();
});
await test('Canvas callback throw records failure and keeps maps restored', async () => {
  const f = await fixture(); await f.adapter.prepare(); f.adapter.applyOriginalKtx();
  assert.equal((await f.adapter.withCanvasAppearance(async () => { throw Error('forced callback'); })).applied, false);
  assert.match(f.adapter.snapshot().lastFailure, /forced callback/); f.adapter.dispose();
});
await test('separate avatar materials remain independent', async () => {
  const first = await fixture(), second = await fixture(); await first.adapter.prepare(); first.adapter.applyOriginalKtx();
  for (const { material, texture } of second.originals) assert.equal(material.map, texture);
  first.adapter.dispose(); second.adapter.dispose();
});
await test('shared material second ownership is rejected', async () => {
  const f = await fixture(); assert.throws(() => createKtxPilotAdapter(f.options), /another pilot instance/); f.adapter.dispose();
});
await test('wrong body SHA refuses construction', async () => {
  const f = await fixture(); assert.throws(() => createKtxPilotAdapter({ ...f.options, avatarSha256: 'wrong' }), /identity mismatch/); f.adapter.dispose();
});
await test('dispose restores experiment-owned maps and preserves external Canvas maps', async () => {
  const f = await fixture(); await f.adapter.prepare(); f.adapter.applyOriginalKtx();
  const canvas = new THREE.Texture({ width: 1024, height: 1024, getContext() {} });
  f.originals[1].material.map = canvas; f.adapter.dispose();
  assert.equal(f.originals[0].material.map, f.originals[0].texture); assert.equal(f.originals[1].material.map, canvas);
});
await test('unprepared apply refuses and repeated dispose is safe', async () => {
  const f = await fixture(); assert.equal(f.adapter.applyOriginalKtx().applied, false);
  f.adapter.dispose(); f.adapter.dispose(); assert.equal((await f.adapter.prepare()).prepared, false);
});

const report = { schema: 'm2-ktx-pilot-adapter-cpu-v1', threeRevision: THREE.REVISION,
  realBrowserOrDecoderExecuted: false, scope: 'Real Three Texture/CompressedTexture/LoadingManager with stubbed fetch and KTX decode', results };
await writeFile(new URL('../../evidence/m2-ktx-pilot-source-v1/adapter-cpu.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(`${results.length} adapter CPU checks passed`);
