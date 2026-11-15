// Bounded original F/M brow sample readback. Requires an explicitly frozen build.
// No runtime edits, synthetic blink, dance playback, or new body compatibility.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('../prototype/node_modules/playwright');
const { verifyCandidate } = require('./qa-m1-common.cjs');
const BUILD = process.env.QA_M2_BUILD;
if (!/^[a-f0-9]{12}$/.test(BUILD || '')) throw Error('QA_M2_BUILD must identify the frozen candidate');
const BASE = process.env.QA_M2_URL || 'http://127.0.0.1:4277/';
const OUT = path.resolve(process.env.QA_M2_OUT || `evidence/m2-brow-sample-${BUILD}`);
const SAMPLE = 'height1-spacing1-v1';
const IDS = {
  female: ['beta-base-female-m1', '027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'],
  male: ['beta-base-male-m1b', '62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'],
};
const report = { build: BUILD, url: BASE, started: new Date().toISOString(), checks: [], identities: [], errors: [], shots: [], movies: [],
  limits: ['Original F/M only; one combined brow sample, not arbitrary brow editing.', '45-degree still is QA camera-only, not a product preset.', 'Page reopen uses the same browser context/localStorage, not cloud persistence.', 'Real automatic blink is observed; no expression weights are injected.', 'Recording frame intervals are not a target-PC performance benchmark.', 'Static images and later filmstrips are engineering review, not continuous human visual acceptance.'] };
const save = () => fs.writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
async function check(name, fn) {
  try { report.checks.push({ name, passed: true, result: await fn() }); console.log('PASS', name); }
  catch (e) { report.checks.push({ name, passed: false, error: String(e), stack: e.stack }); console.log('FAIL', name, String(e)); }
  await save();
}
async function ready(p) { await p.waitForFunction(() => window.__debug?.ready && !document.querySelector('#appearance-fields').disabled && !document.querySelector('#appearance-identity-fields').disabled, null, { timeout: 60000 }); }
const tab = (p, name) => p.locator(`[data-workbench-tab=${name}]`).click();
async function select(p, id, value) { await p.locator(id).selectOption(value); await ready(p); }
async function brow(p, value) { await tab(p, 'appearance'); await p.locator('#appearance-geometry').evaluate(n => n.open = true); await select(p, '#brow-sample', value); assert.equal((await state(p)).geometry.browSample, value); }
async function mouth(p, value) { await tab(p, 'appearance'); await p.locator('#appearance-geometry').evaluate(n => n.open = true); await p.locator('#mouth-width').fill(String(value)); await p.locator('#mouth-width').press('Tab'); await ready(p); assert.equal((await state(p)).geometry.mouthWidth, value / 100); }
async function view(p, direction) { await p.locator('[data-inspect-framing=face]').click(); await p.locator(`[data-inspect-direction=${direction}]`).click(); await p.waitForTimeout(80); }
async function state(p) { return p.evaluate(() => { const a = __debug.avatar(); return { body: a.profile.bodyType, sha: a.profile.sha256, outfit: __debug.snapshot().outfit, appearance: a.appearance.getState(), geometry: a.facialGeometry.getState(), live: a.livePresentation.getState() }; }); }
const selection = s => ({ body: s.body, sha: s.sha, outfit: s.outfit, appearance: Object.fromEntries(['hairStyle', 'hairColor', 'skinTone', 'eyeColor', 'lipColor'].map(k => [k, s.appearance[k]])), mouthWidth: s.geometry.mouthWidth, browSample: s.geometry.browSample });
async function hashes(p, peer = false) {
  return p.evaluate(async peer => {
    const a = peer ? __debug.comparison().avatar : __debug.avatar(), nodes = [];
    a.vrm.scene.traverse(n => { if (n.isMesh && n.geometry.morphAttributes.position?.length) nodes.push(n); });
    async function hash(at) { const raw = new Float32Array(at.count * at.itemSize); for (let i = 0; i < at.count; i++) for (let j = 0; j < at.itemSize; j++) raw[i * at.itemSize + j] = at.getComponent(i, j); return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', raw)), x => x.toString(16).padStart(2, '0')).join(''); }
    return Promise.all(nodes.map(async n => ({ name: n.name, uuid: n.geometry.uuid, position: await hash(n.geometry.attributes.position), normal: await hash(n.geometry.attributes.normal), morphPosition: await Promise.all(n.geometry.morphAttributes.position.map(hash)) })));
  }, peer);
}
const attributeBytes = rows => rows.map(({uuid, ...rest}) => rest);
async function shot(p, name, angle45 = false) {
  const file = name + '.png'; let camera;
  if (angle45) {
    // Synchronous render/readback/restore: no product state or orbit target changes.
    const result = await p.evaluate(() => {
      const d = __debug, c = d.cameraObject(), a = d.avatar(), pos = c.position.clone(), q = c.quaternion.clone();
      const target = a.vrm.humanoid.getRawBoneNode('head').getWorldPosition(pos.clone()).add({ x: 0, y: .04, z: 0 });
      const offset = pos.clone().set(Math.SQRT1_2 * .78, 0, Math.SQRT1_2 * .78).applyAxisAngle(pos.clone().set(0, 1, 0), a.root.rotation.y);
      try { c.position.copy(target).add(offset); c.lookAt(target); c.updateMatrixWorld(true); d.renderer.render(d.scene, c); return { png: d.renderer.domElement.toDataURL('image/png'), camera: { position: c.position.toArray(), quaternion: c.quaternion.toArray(), target: target.toArray(), diagnostic: true } }; }
      finally { c.position.copy(pos); c.quaternion.copy(q); c.updateMatrixWorld(true); d.renderer.render(d.scene, c); }
    });
    await fs.writeFile(path.join(OUT, file), Buffer.from(result.png.split(',')[1], 'base64')); camera = result.camera;
  } else { await p.screenshot({ path: path.join(OUT, file) }); camera = await p.evaluate(() => ({ position: __debug.cameraObject().position.toArray(), quaternion: __debug.cameraObject().quaternion.toArray() })); }
  report.shots.push({ file, camera, state: await state(p) });
}
async function traceStart(p) { await p.evaluate(() => {
  const q = window.__browQA = { start: performance.now(), last: null, run: true, rows: [] };
  function tick(t) { if (!q.run) return; const d = __debug, a = d.avatar(), s = d.snapshot(); q.rows.push({ t: (t - q.start) / 1000, dt: q.last === null ? null : (t - q.last) / 1000, sim: s.simulationTime, mode: s.mode, geometry: a.facialGeometry.getState(), expressions: Object.fromEntries(['aa', 'happy', 'blink'].map(k => [k, a.vrm.expressionManager.getValue(k)])) }); q.last = t; requestAnimationFrame(tick); }
  requestAnimationFrame(tick);
}); }
function summarize(trace) {
  const rows = trace.rows.filter(r => r.t >= 0), dt = rows.slice(1).map(r => r.dt).filter(Number.isFinite), first = rows[0], last = rows.at(-1);
  return { rows: rows.length, negativeInitialSamples: trace.rows.filter(r => r.t < 0).length, rawFirst: trace.rows[0], rawLast: trace.rows.at(-1), wall: last.t - first.t, sim: last.sim - first.sim, ratio: (last.sim - first.sim) / (last.t - first.t), maxFrameMs: Math.max(...dt) * 1000, over33ms: dt.filter(x => x > .033333).length, over50ms: dt.filter(x => x > .05).length, maxBlink: Math.max(...rows.map(r => r.expressions.blink || 0)) };
}

(async () => {
  await fs.mkdir(OUT, { recursive: true });
  try { await fs.access(path.join(OUT, 'report.json')); throw Error('Refuse evidence overwrite'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  await fs.copyFile(__filename, path.join(OUT, 'executed-script.cjs')); await save();
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  async function open(context, body) { const p = await context.newPage(); p.on('pageerror', e => report.errors.push({ body, error: String(e) })); await p.goto(BASE + '?workbench=appearance&body=' + body); await ready(p); report.identities.push(await verifyCandidate(p, { build: BUILD, assetId: IDS[body][0], sha256: IDS[body][1] })); return p; }
  try {
    const store = await browser.newContext({ viewport: { width: 1600, height: 1000 } }), saved = {};
    for (const body of ['female', 'male']) {
      let p = await open(store, body);
      await check(body + ' composition, independent reset and no-hair static views', async () => {
        await select(p, '#appearance-hair-style', 'none'); const original = await hashes(p);
        await brow(p, SAMPLE); const browOnly = await hashes(p); assert.notDeepEqual(browOnly.map(x => x.position), original.map(x => x.position));
        for (const value of [-4, 4]) { await mouth(p, value); assert.equal((await state(p)).geometry.browSample, SAMPLE); await p.locator('#mouth-width-reset').click(); await ready(p); assert.deepEqual(attributeBytes(await hashes(p)), attributeBytes(browOnly)); }
        await mouth(p, 4); await brow(p, 'none'); const mouthOnly = await hashes(p); assert.equal((await state(p)).geometry.mouthWidth, .04);
        await brow(p, SAMPLE); await brow(p, 'none'); assert.deepEqual(attributeBytes(await hashes(p)), attributeBytes(mouthOnly));
        await mouth(p, 0); assert.deepEqual(await hashes(p), original);
        for (const value of ['none', SAMPLE]) { await brow(p, value); await p.evaluate(() => { __debug.command({ type: 'speaking', value: false }); __debug.command({ type: 'expression', name: 'neutral' }); });
          for (const direction of ['front', 'side']) { await view(p, direction); await shot(p, `${body}-${value}-neutral-${direction}`); }
          await view(p, 'front'); await shot(p, `${body}-${value}-neutral-diagonal45`, true);
        }
        return { original, browOnly, mouthOnly, final: await state(p) };
      });
      await check(body + ' v2 save/reopen, v1 no-brow migration, invalid brow SHA rollback', async () => {
        await brow(p, SAMPLE); await mouth(p, body === 'female' ? 4 : -4);
        await select(p, '#appearance-hair-color', body === 'female' ? 'brown' : 'blonde'); await p.locator('#appearance-save').click();
        const key = 'zbgs:appearance-draft:v1:' + body, before = selection(await state(p));
        const record = await p.evaluate(k => JSON.parse(localStorage.getItem(k)), key); assert.equal(record.schema, 'workbench-appearance-recipe-v2'); assert.equal(record.geometry.browSample, SAMPLE); assert.match(record.geometry.browRecipeSha256, /^[a-f0-9]{64}$/); saved[body] = record;
        await p.close(); p = await open(store, body); assert.deepEqual(selection(await state(p)), before);
        const originalAttrs = await hashes(p), bad = structuredClone(record); bad.geometry.browRecipeSha256 = '0'.repeat(64);
        await p.evaluate(({ key, record }) => localStorage.setItem(key, JSON.stringify(record)), { key, record: bad }); await p.locator('#appearance-restore').click(); await ready(p);
        assert.equal(await p.locator('#appearance-status').getAttribute('data-error'), 'true'); assert.deepEqual(selection(await state(p)), before); assert.deepEqual(attributeBytes(await hashes(p)), attributeBytes(originalAttrs));
        const legacy = structuredClone(record); legacy.schema = 'workbench-appearance-recipe-v1'; legacy.rulesVersion = 'workbench-appearance-rules-v1'; delete legacy.geometry.browSample; delete legacy.geometry.browRecipeSha256;
        await p.evaluate(({ key, record }) => localStorage.setItem(key, JSON.stringify(record)), { key, record: legacy }); await p.locator('#appearance-restore').click(); await ready(p); assert.deepEqual(selection(await state(p)), { ...before, browSample: 'none' });
        await p.evaluate(({ key, record }) => localStorage.setItem(key, JSON.stringify(record)), { key, record }); await p.locator('#appearance-restore').click(); await ready(p); assert.deepEqual(selection(await state(p)), before);
        return { before, record, legacy, final: await state(p) };
      });
      await p.close();
    }
    let p = await open(store, 'female');
    await check('same-document F/M drafts and same-source peer geometry isolation', async () => {
      const token = await p.evaluate(() => window.__browDocument = crypto.randomUUID());
      for (const body of ['male', 'female']) { await p.locator(`[data-appearance-group=${body}]`).click(); await ready(p); assert.equal(await p.evaluate(() => __browDocument), token); const s = await state(p); assert.equal(s.body, body); assert.equal(s.geometry.browSample, SAMPLE); assert.equal(s.geometry.mouthWidth, saved[body].geometry.mouthWidth); assert.deepEqual(await p.evaluate(k => JSON.parse(localStorage.getItem(k)), 'zbgs:appearance-draft:v1:' + body), saved[body]); }
      const rows = [];
      for (const body of ['female', 'male']) { if ((await state(p)).body !== body) { await p.locator(`[data-appearance-group=${body}]`).click(); await ready(p); }
        const primary = await hashes(p); await p.evaluate(body => __debug.loadComparison(body), body); const peerBefore = await hashes(p, true);
        const result = await p.evaluate(sample => __debug.comparison().command({ type: 'faceGeometry', browSample: sample, mouthWidth: .04 }), SAMPLE); assert(result.applied); const peerAfter = await hashes(p, true); assert.notDeepEqual(peerAfter.map(x => x.position), peerBefore.map(x => x.position)); assert.deepEqual(await hashes(p), primary);
        const reset = await p.evaluate(() => __debug.comparison().command({ type: 'faceGeometry', browSample: 'none', mouthWidth: 0 })); assert(reset.applied); assert.deepEqual(await hashes(p, true), peerBefore); assert.deepEqual(await hashes(p), primary); rows.push({ body, primary, peerBefore, peerAfter, result, reset }); await p.evaluate(() => __debug.removeComparison());
      } return rows;
    });
    await store.close();
    for (const body of ['female', 'male']) {
      const c = await browser.newContext({ viewport: { width: 1600, height: 1000 }, recordVideo: { dir: path.join(OUT, 'raw-video'), size: { width: 1600, height: 1000 } } }), p = await open(c, body);
      await select(p, '#appearance-hair-style', 'none'); await view(p, 'front'); await traceStart(p);
      await check(body + ' original/new brow short normal-rate expressive playback', async () => {
        for (const value of ['none', SAMPLE]) {
          await brow(p, value); await mouth(p, value === 'none' ? -4 : 4); await tab(p, 'actions'); await p.locator('[data-expression=neutral]').click(); await p.waitForTimeout(400);
          await p.locator('[data-expression=happy]').click(); await p.locator('#speaking-button').click(); await p.getByRole('button', { name: '看向镜头', exact: true }).click();
          // At least one full 3.6-second blink period per brow state; no skin hashing during playback.
          await p.waitForTimeout(3900); await view(p, 'side'); await p.waitForTimeout(900); await view(p, 'front');
          await p.locator('#speaking-button').click(); await p.locator('[data-expression=neutral]').click();
        }
        await brow(p, 'none'); await mouth(p, 0); await p.waitForTimeout(400); return await state(p);
      });
      const trace = await p.evaluate(() => { __browQA.run = false; return __browQA; }); const summary = summarize(trace);
      await fs.writeFile(path.join(OUT, `${body}-brow-1x-trace.json`), JSON.stringify(trace)); const video = p.video(); await c.close(); await video.saveAs(path.join(OUT, `${body}-brow-1x.webm`));
      report.movies.push({ file: `${body}-brow-1x.webm`, trace: `${body}-brow-1x-trace.json`, summary });
      await check(body + ' real automatic blink observed in both brow states', async () => { const peaks = Object.fromEntries(['none', SAMPLE].map(s => [s, Math.max(0, ...trace.rows.filter(r => r.t >= 0 && r.geometry.browSample === s).map(r => r.expressions.blink || 0))])); for (const value of Object.values(peaks)) assert(value > .9, 'No near-closed automatic blink recorded'); return peaks; });
    }
    report.status = report.checks.every(c => c.passed) && !report.errors.length ? 'technical-passed-visual-review-pending' : 'failures-preserved';
  } catch (e) { report.status = 'incomplete'; report.fatal = String(e); console.error(e); }
  finally { await browser.close(); report.finished = new Date().toISOString(); await save(); console.log('BROWSER CLOSED', OUT); }
})().catch(e => { console.error(e); process.exitCode = 1; });
