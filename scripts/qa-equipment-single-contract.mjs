import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import * as THREE from '../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {createEquipment} from '../prototype/src/equipment.js';
import {foundationProfile} from '../prototype/src/foundation-profiles.js';

const out = process.argv[2];
if (!out) throw Error('Provide an evidence output directory');
const expectBug = process.argv.includes('--expect-bug');
const base = new URL('../prototype/public/', import.meta.url);
const cfg = foundationProfile('male');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(await readFile(new URL('.' + cfg.manifestUrl, base)));
const items = manifest.items.map(entry => ({
  ...entry,
  url: new URL(entry.url, 'http://fixture.invalid' + cfg.manifestUrl).pathname,
}));
const originalTop = items.find(entry => entry.id === cfg.ids.top);
const originalShorts = items.find(entry => entry.id === cfg.ids.shorts);
// Exact existing male GLB bytes and binds, with test-only composition metadata.
// These aliases are not onePiece/outerwear assets and prove no physical fit.
const onePiece = {...originalTop, id: 'fixture-one-piece', slot: 'onePiece'};
const outer = {...originalShorts, id: 'fixture-outer', slot: 'outerwear', layerWith: [cfg.ids.top]};
const otherTop = {...originalTop, id: 'fixture-other-top'};
const fixtureItems = [...items, onePiece, outer, otherTop];
const fixtureUrl = '/__qa__/single-equipment.json';
const fixtureManifest = {...manifest, items: fixtureItems};
const originalParse = GLTFLoader.prototype.parseAsync;
GLTFLoader.prototype.parseAsync = function (...args) {
  this.register(() => ({name: 'CPUTextureDecodeFixture', loadTexture: async () =>
    new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1)}));
  return originalParse.apply(this, args);
};
const bodyBytes = await readFile(new URL('.' + cfg.url, base));
assert.equal(hash(bodyBytes), cfg.sha256);
const bufferOf = bytes => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const parsed = await new GLTFLoader().parseAsync(bufferOf(bodyBytes), '');
parsed.scene.updateMatrixWorld(true);
const vrm = {scene: parsed.scene, humanoid: {getRawBoneNode: () => null}};
const oldFetch = globalThis.fetch, oldWindow = globalThis.window;
globalThis.window = {location: {href: 'http://fixture.invalid/'}};
let deferred, adapter;
const observations = [];
const visible = () => fixtureItems.filter(entry => adapter.get(entry.id)?.container.visible)
  .map(entry => entry.id).sort();
globalThis.fetch = async input => {
  const url = new URL(input, window.location.href);
  if (url.pathname === fixtureUrl) return {ok: true, json: async () => fixtureManifest};
  const bytes = await readFile(new URL('.' + url.pathname, base));
  if (url.pathname === deferred?.path) {
    deferred.started();
    await deferred.gate;
  }
  return {ok: true, arrayBuffer: async () => bufferOf(bytes)};
};
async function fresh(ids) {
  adapter?.dispose();
  deferred = null;
  adapter = await createEquipment({vrm, avatarSha256: cfg.sha256, manifestUrl: fixtureUrl});
  await adapter.equipSet(ids);
}
function hold(id) {
  let started, release;
  const begun = new Promise(resolve => {started = resolve;});
  const gate = new Promise(resolve => {release = resolve;});
  deferred = {path: fixtureItems.find(entry => entry.id === id).url, started, gate};
  return {begun, release};
}
async function conflicting(name, before, candidate, pattern, start = () => adapter.equip(candidate)) {
  const pending = start();
  let error;
  try { await pending; } catch (caught) { error = caught.message; }
  if (expectBug) {
    assert.equal(error, undefined);
    assert.deepEqual(visible(), [...before.filter(id => fixtureItems.find(entry => entry.id === id).slot !==
      fixtureItems.find(entry => entry.id === candidate).slot), candidate].sort());
  } else {
    assert.match(error ?? '', pattern);
    assert.deepEqual(visible(), [...before].sort());
    assert.equal(adapter.get(candidate).container.visible, false);
  }
  observations.push({case: name, error: error ?? null, visible: visible(), illegalCombinationApplied: expectBug});
}
try {
  for (const [before, candidate, pattern] of [
    [[cfg.ids.top], onePiece.id, /conflict in top/],
    [[cfg.ids.pants], onePiece.id, /conflict in bottom/],
    [[onePiece.id], cfg.ids.top, /conflict in top/],
    [[onePiece.id], cfg.ids.pants, /conflict in bottom/],
    [[otherTop.id], outer.id, /Unvalidated equipment layering/],
    [[outer.id], otherTop.id, /Unvalidated equipment layering/],
    [[onePiece.id], outer.id, /Unvalidated equipment layering/],
    [[outer.id], onePiece.id, /Unvalidated equipment layering/],
    [[cfg.ids.top, outer.id], otherTop.id, /Unvalidated equipment layering/],
  ]) {
    await fresh(before);
    await conflicting('single selection composition ' + before.join('+') + ' -> ' + candidate,
      before, candidate, pattern);
  }
  await fresh([cfg.ids.top]);
  const waitingOuter = hold(outer.id);
  const pendingOuter = adapter.equip(outer.id);
  await waitingOuter.begun;
  deferred = null;
  await adapter.equip(otherTop.id);
  waitingOuter.release();
  await conflicting('outer completes after the visible top was replaced', [otherTop.id], outer.id,
    /Unvalidated equipment layering/, () => pendingOuter);

  await fresh([cfg.ids.shoes]);
  const waitingPiece = hold(onePiece.id);
  const pendingPiece = adapter.equip(onePiece.id);
  await waitingPiece.begun;
  deferred = null;
  await adapter.equip(cfg.ids.pants);
  waitingPiece.release();
  await conflicting('onePiece completes after a distinct bottom request committed',
    [cfg.ids.shoes, cfg.ids.pants], onePiece.id, /conflict in bottom/, () => pendingPiece);

  await fresh([cfg.ids.top, cfg.ids.shoes]);
  const olderSet = hold(cfg.ids.pants);
  const pendingOlderSet = adapter.equipSet([cfg.ids.shoes, cfg.ids.pants]);
  await olderSet.begun;
  deferred = null;
  await conflicting('rejected newer single intent supersedes a pending final set',
    [cfg.ids.top, cfg.ids.shoes], onePiece.id, /conflict in top/);
  const afterSingleIntent = visible();
  olderSet.release();
  assert.equal((await pendingOlderSet).reason, 'superseded');
  assert.deepEqual(visible(), afterSingleIntent);

  await fresh([cfg.ids.top]);
  await conflicting('rejected loaded candidate can be retried after removing conflict',
    [cfg.ids.top], onePiece.id, /conflict in top/);
  adapter.unequip('top');
  assert.equal((await adapter.equip(onePiece.id)).applied, true);
  assert.deepEqual(visible(), [onePiece.id]);
  observations.push({case: 'retry of prepared onePiece after conflict removed', visible: visible()});

  await fresh([otherTop.id]);
  const allowedOuter = hold(outer.id);
  const pendingAllowedOuter = adapter.equip(outer.id);
  await allowedOuter.begun;
  deferred = null;
  await adapter.equip(cfg.ids.top);
  allowedOuter.release();
  assert.equal((await pendingAllowedOuter).applied, true);
  assert.deepEqual(visible(), [cfg.ids.top, outer.id].sort());
  observations.push({case: 'outer validates latest allowed inner after initially incompatible inner', visible: visible()});

  await fresh([cfg.ids.top, cfg.ids.shoes]);
  const removedTop = hold(onePiece.id);
  const pendingAfterRemoval = adapter.equip(onePiece.id);
  await removedTop.begun;
  adapter.unequip('top');
  removedTop.release();
  assert.equal((await pendingAfterRemoval).applied, true);
  assert.deepEqual(visible(), [cfg.ids.shoes, onePiece.id].sort());
  observations.push({case: 'onePiece validates latest visible set after top removed', visible: visible()});

  await fresh([cfg.ids.shoes]);
  const oldTop = hold(cfg.ids.top);
  const pendingOldTop = adapter.equip(cfg.ids.top);
  await oldTop.begun;
  deferred = null;
  await adapter.equip(otherTop.id);
  oldTop.release();
  assert.equal((await pendingOldTop).applied, false);
  assert.deepEqual(visible(), [cfg.ids.shoes, otherTop.id].sort());
  observations.push({case: 'older same-slot request cannot revive', visible: visible()});

  await fresh([cfg.ids.shoes]);
  const disposedTop = hold(cfg.ids.top);
  const pendingDisposed = adapter.equip(cfg.ids.top);
  await disposedTop.begun;
  const rejectDisposed = assert.rejects(pendingDisposed, /disposed/);
  adapter.dispose();
  disposedTop.release();
  await rejectDisposed;
  assert.deepEqual(visible(), []);
  assert.equal(parsed.scene.getObjectByName('Equipment:' + cfg.ids.top), undefined);
  await assert.rejects(adapter.equip(cfg.ids.top), /disposed/);
  observations.push({case: 'disposed single selection cannot attach or revive', visible: visible()});
} finally {
  adapter?.dispose();
  globalThis.fetch = oldFetch;
  if (oldWindow === undefined) delete globalThis.window;
  else globalThis.window = oldWindow;
  GLTFLoader.prototype.parseAsync = originalParse;
}
const assets = await Promise.all(items.map(async entry => {
  const bytes = await readFile(new URL('.' + entry.url, base));
  assert.equal(hash(bytes), entry.sha256);
  assert.equal(bytes.length, entry.bytes);
  return {id: entry.id, url: entry.url, sha256: entry.sha256, bytes: entry.bytes};
}));
const report = {
  passed: true, expectBug, sourceSha256: hash(await readFile(new URL('../prototype/src/equipment.js', import.meta.url))),
  qaSourceSha256: hash(await readFile(new URL(import.meta.url))),
  bodySha256: cfg.sha256, assets,
  fixtureAliases: [onePiece, outer, otherTop].map(({id, slot, url, layerWith}) => ({id, slot, url, layerWith})),
  observations, browserStarted: false,
  scope: 'Actual male GLB loader, identity, bytes, skin and bind validation. Test-only slot aliases and texture decoding. No physical onePiece/outerwear, layering, animation or rendered-fit acceptance.',
};
await mkdir(out, {recursive: true});
await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
