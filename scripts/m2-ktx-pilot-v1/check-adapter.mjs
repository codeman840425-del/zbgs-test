import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import { createKtxPilotAdapter } from './runtime-adapter.mjs';

const manifest = JSON.parse(await readFile(new URL('../../assets-source/m2-ktx-pilot-v1/manifest.json', import.meta.url)));
const sha = async bytes => Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
const results = [];
async function test(name, operation) {
  const observation = await operation(); results.push({ name, passed: true, observation });
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

await test('GPU release preserves every current PNG reference and ignores external textures', async () => {
  const f = await fixture(); await f.adapter.prepare();
  let originalDisposals = 0, externalDisposals = 0;
  f.originals.forEach(({ texture }) => texture.addEventListener('dispose', () => originalDisposals++));
  const external = new THREE.Texture();
  external.addEventListener('dispose', () => externalDisposals++);
  f.originals[0].material.lightMap = external;
  const report = f.adapter.releaseInactiveGpu();
  assert.equal(originalDisposals, 0); assert.equal(externalDisposals, 0);
  assert.equal(report.released.length, 2); assert.ok(report.released.every(value => value.kind === 'ktx'));
  assert.ok(report.retained.filter(value => value.kind === 'original-png').every(value => value.references.length));
  f.adapter.dispose();
  return report;
});
await test('GPU release deduplicates unused PNG and retains exact image data for restore', async () => {
  const f = await fixture(); await f.adapter.prepare(); f.adapter.applyOriginalKtx();
  const images = f.originals.map(({ texture }) => texture.image);
  let disposals = 0, closes = 0;
  f.originals.forEach(({ texture }) => {
    texture.image.close = () => closes++;
    texture.addEventListener('dispose', () => disposals++);
  });
  const first = f.adapter.releaseInactiveGpu(), second = f.adapter.releaseInactiveGpu();
  assert.equal(first.released.length, 2); assert.equal(second.released.length, 0);
  assert.equal(disposals, 2); assert.equal(closes, 0);
  assert.ok(second.retained.some(value => value.reason.includes('Already released')));
  const versions = f.originals.map(({ texture }) => texture.version);
  f.adapter.restorePng();
  f.originals.forEach(({ material, texture }, index) => {
    assert.equal(material.map, texture); assert.equal(texture.image, images[index]);
    assert.ok(texture.version > versions[index]);
  });
  f.adapter.applyOriginalKtx(); f.adapter.releaseInactiveGpu();
  assert.equal(disposals, 4); assert.equal(closes, 0); f.adapter.dispose();
  return { first, repeated: second, originalDisposeEventsAfterReactivation: disposals, imageCloseCalls: closes };
});
await test('GPU release preserves inactive KTX mip data and reactivates its exact objects', async () => {
  const f = await fixture(); await f.adapter.prepare(); f.adapter.applyOriginalKtx();
  const compressed = f.originals.map(({ material }) => material.map);
  const mipData = compressed.map(texture => texture.mipmaps[0].data);
  let disposals = 0;
  compressed.forEach(texture => texture.addEventListener('dispose', () => disposals++));
  await f.adapter.withCanvasAppearance(async () => ({ applied: true }));
  assert.equal(f.adapter.releaseInactiveGpu().released.filter(value => value.kind === 'ktx').length, 2);
  assert.equal(f.adapter.releaseInactiveGpu().released.length, 0); assert.equal(disposals, 2);
  const versions = compressed.map(texture => texture.version);
  f.adapter.applyOriginalKtx();
  f.originals.forEach(({ material }, index) => {
    assert.equal(material.map, compressed[index]); assert.equal(material.map.mipmaps[0].data, mipData[index]);
    assert.ok(material.map.version > versions[index]);
  });
  f.adapter.dispose();
});
await test('GPU release protects original PNG used by another attached material', async () => {
  const f = await fixture(); await f.adapter.prepare(); f.adapter.applyOriginalKtx();
  const world = new THREE.Scene(); world.add(f.options.vrm.scene);
  const external = new THREE.MeshBasicMaterial({ map: f.originals[0].texture });
  world.add(new THREE.Mesh(new THREE.BufferGeometry(), external));
  const report = f.adapter.releaseInactiveGpu();
  assert.ok(report.retained.some(value => value.uuid === f.originals[0].texture.uuid && value.references.length));
  assert.equal(report.released.filter(value => value.kind === 'original-png').length, 1);
  f.adapter.dispose();
});
await test('GPU release protects nested uniform arrays and cyclic structs', async () => {
  const f = await fixture(); await f.adapter.prepare(); f.adapter.applyOriginalKtx();
  const struct = { samplers: [f.originals[0].texture] }; struct.self = struct;
  const shader = new THREE.ShaderMaterial({ uniforms: { nested: { value: struct } } });
  f.options.vrm.scene.add(new THREE.Mesh(new THREE.BufferGeometry(), shader));
  const report = f.adapter.releaseInactiveGpu();
  assert.ok(report.retained.some(value => value.uuid === f.originals[0].texture.uuid &&
    value.references.some(path => path.includes('.uniforms.nested.value.samplers.0'))));
  f.adapter.dispose();
});
await test('GPU release protects custom shadow materials and environment references', async () => {
  const f = await fixture(); await f.adapter.prepare(); f.adapter.applyOriginalKtx();
  const world = new THREE.Scene(); world.add(f.options.vrm.scene); world.environment = f.originals[0].texture;
  f.options.vrm.scene.children[0].customDepthMaterial = new THREE.MeshDepthMaterial({ map: f.originals[1].texture });
  const report = f.adapter.releaseInactiveGpu();
  assert.equal(report.released.length, 0);
  assert.ok(report.retained.some(value => value.references?.some(path => path.includes('.customDepthMaterial'))));
  f.adapter.dispose();
});
await test('GPU release protects an active Texture alias sharing the original Source', async () => {
  const f = await fixture(); await f.adapter.prepare(); f.adapter.applyOriginalKtx();
  const alias = f.originals[0].texture.clone();
  f.originals[1].material.lightMap = alias;
  const report = f.adapter.releaseInactiveGpu();
  const retained = report.retained.find(value => value.uuid === f.originals[0].texture.uuid);
  assert.match(retained.reason, /shares this Source/); assert.equal(retained.aliases[0].uuid, alias.uuid);
  f.adapter.dispose();
});
await test('GPU release rechecks references after a dispose listener rebinds another candidate', async () => {
  const f = await fixture(); await f.adapter.prepare(); f.adapter.applyOriginalKtx();
  f.originals[0].texture.addEventListener('dispose', () => { f.originals[0].material.lightMap = f.originals[1].texture; });
  const report = f.adapter.releaseInactiveGpu();
  assert.equal(report.released.filter(value => value.kind === 'original-png').length, 1);
  assert.ok(report.retained.some(value => value.uuid === f.originals[1].texture.uuid && value.references.length));
  f.adapter.dispose();
});
await test('GPU reference scan failure records the reason and releases nothing', async () => {
  const f = await fixture(); await f.adapter.prepare(); f.adapter.applyOriginalKtx();
  const uniforms = {};
  Object.defineProperty(uniforms, 'broken', { enumerable: true, get() { throw Error('forced uniform scan failure'); } });
  f.originals[0].material.uniforms = uniforms;
  const report = f.adapter.releaseInactiveGpu();
  assert.equal(report.applied, false); assert.equal(report.released.length, 0);
  assert.ok(report.failures.every(value => value.reason.includes('forced uniform scan failure')));
  f.adapter.dispose();
  return report;
});
await test('GPU release refuses unprepared or disposed adapters', async () => {
  const f = await fixture(); assert.equal(f.adapter.releaseInactiveGpu().applied, false);
  f.adapter.dispose(); const report = f.adapter.releaseInactiveGpu();
  assert.equal(report.applied, false); assert.equal(report.released.length, 0);
});

const report = { schema: 'm2-ktx-pilot-adapter-gpu-release-cpu-v1', threeRevision: THREE.REVISION,
  realBrowserOrDecoderExecuted: false, scope: 'Real Three Texture/CompressedTexture/LoadingManager with stubbed fetch and KTX decode', results };
await writeFile(new URL('../../evidence/m2-ktx-pilot-source-v1/adapter-gpu-release-cpu.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(`${results.length} adapter CPU checks passed`);
