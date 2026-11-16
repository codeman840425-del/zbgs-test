// Attach to a caller-owned existing page. No browser launch or navigation.
const fs = require('node:fs/promises'), path = require('node:path');
const BODY = '027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95';
const HAIR = '1b785f9d54107818cee39eda2de7263ad0720ce90968fbaa7cc32c2465e3c385';
const FIT = '5e6d7499852ffc6198e6c7190a50cf5b55abd51f535c038044201b1cd9ada04f';

function installCaptureInPage({fit, stopAfterMs = 2800}) {
  const d = window.__debug, actor = d.avatar(), appearance = actor.appearance, vrm = actor.vrm;
  if (window.__hairSeatFeasibilityCapture) throw Error('A seat diagnostic is already installed');
  if (d.snapshot().mode === 'sit') throw Error('Begin from standing before the seat transition');
  const head = vrm.humanoid.getRawBoneNode('head'), chest = vrm.humanoid.getRawBoneNode('chest');
  const names = new Map();
  vrm.scene.traverse(node => { if (node.isBone && /^Pony[0-6]$/.test(node.name)) names.set(node.name, node); });
  if (names.size !== 7) throw Error('Expected the exact seven auxiliary ponytail bones');
  const close = (a, b) => Math.abs(a-b) < 1e-12;
  const sameVector = (a, b) => a?.toArray().every((v, i) => close(v, b[i]));
  const body = fit.dynamics.colliders.map((config, i) => {
    const parent = vrm.humanoid.getRawBoneNode(config.bone), found = [];
    parent.traverse(node => {
      const s = node.shape;
      if (node.parent === parent && s?.type === config.shape && close(s.radius, config.radius) && sameVector(s.offset, config.offset) &&
          (config.shape !== 'capsule' || sameVector(s.tail, config.tail))) found.push(node);
    });
    if (found.length !== 1) throw Error('Missing/ambiguous owned body shape '+i);
    return {object: found[0], id: 'body-'+i, category: 'body', source: config};
  });
  const boxes = d.chairColliders(), room = [];
  for (const box of boxes) box.mesh.traverse(node => {
    if (node.shape?.type === 'room-oriented-box' && names.get(node.shape.bone.name) === node.shape.bone) {
      room.push({object: node, id: box.name+'/'+node.shape.bone.name, category: 'room', box: {name: box.name, min: box.localBox.min.toArray(), max: box.localBox.max.toArray()}});
    }
  });
  if (body.length !== 3 || room.length !== 12) throw Error('Expected three body and twelve per-joint room shapes');
  const observed = [...body, ...room], restores = [], frames = [], observationErrors = [];
  let current = null, triggeredAt = null, done = false, finished = false;
  const originalUpdate = appearance.updateDynamics;
  function replace(object, key, value) {
    const descriptor = Object.getOwnPropertyDescriptor(object, key), original = object[key];
    object[key] = value;
    restores.push(() => {
      if (object[key] !== value) { observationErrors.push('Wrapper ownership changed: '+key); return false; }
      if (descriptor) Object.defineProperty(object, key, descriptor); else delete object[key];
      return object[key] === original;
    });
  }
  function finish() {
    if (finished) throw Error('Diagnostic already restored');
    finished = true; current = null;
    const restored = restores.reverse().map(fn => fn()).every(Boolean);
    delete window.__hairSeatFeasibilityCapture;
    return {frames, triggeredAt, observationErrors, wrappersRestored: restored,
      observedShapes: observed.map(({id, category, source, box}) => ({id, category, source, box}))};
  }
  try {
    for (const info of observed) {
      const shape = info.object.shape, original = shape.calculateCollision;
      replace(shape, 'calculateCollision', function(matrix, point, radius, target) {
        const frame = current, before = frame ? point.toArray() : null;
        const result = original.call(this, matrix, point, radius, target);
        if (frame) try {
          const joint = fit.dynamics.joints.find(j => close(j.hitRadius, radius));
          frame.queries.push({shape: info.id, category: info.category, bone: info.category === 'room' ? this.bone.name : joint?.bone,
            hitRadius: radius, pointBefore: before, pointAfter: point.toArray(), signedDistance: result, targetAfter: target.toArray(),
            colliderMatrix: matrix.toArray(), pivotMatrix: joint ? names.get(joint.bone).matrixWorld.toArray() : null,
            outcome: info.category === 'room' ? this.lastOutcome : null});
        } catch (error) { observationErrors.push(String(error)); }
        return result;
      });
    }
    replace(appearance, 'updateDynamics', function(...args) {
      if (done) return originalUpdate.apply(this, args);
      let frame;
      try {
        if (d.avatar() !== actor) throw Error('Actor changed during capture');
        const s = d.snapshot(), ms = performance.now();
        if (s.mode === 'sit' && triggeredAt === null) triggeredAt = ms;
        frame = {ms, dt: args[0], enabled: args[1], mode: s.mode, sitProgress: s.motion?.sitProgress,
          centerWorld: vrm.scene.matrixWorld.toArray(), headWorld: head.matrixWorld.toArray(), chestWorld: chest.matrixWorld.toArray(), queries: []};
        current = frame;
      } catch (error) { observationErrors.push(String(error)); done = true; }
      try { return originalUpdate.apply(this, args); }
      catch (error) { observationErrors.push('updateDynamics threw: '+String(error)); done = true; throw error; }
      finally {
        current = null;
        if (frame) try {
          frame.dynamics = appearance.getState().hairDynamics;
          frames.push(frame);
          if (triggeredAt === null) while (frames.length && frames[0].ms < frame.ms-350) frames.shift();
          if (triggeredAt !== null && frame.ms-triggeredAt >= stopAfterMs) done = true;
          if (frames.length > 3000) { observationErrors.push('Capture exceeded bounded frame count'); done = true; }
        } catch (error) { observationErrors.push(String(error)); done = true; }
      }
    });
  } catch (error) { finish(); throw error; }
  window.__hairSeatFeasibilityCapture = {status: () => ({done, frames: frames.length, triggeredAt}), finish};
  return {bodyShapes: body.length, roomShapes: room.length};
}

function finishCaptureInPage() {
  return window.__hairSeatFeasibilityCapture?.finish() ?? null;
}

async function capture(page, {build, out, triggerSit = false, stopAfterMs = 2800}) {
  if (!/^[a-f0-9]{12}$/.test(build) || !Number.isInteger(stopAfterMs) || stopAfterMs < 1000 || stopAfterMs > 5000) throw Error('Explicit fixed build and bounded capture interval required');
  await fs.mkdir(out, {recursive: false});
  await fs.copyFile(__filename, path.join(out, 'executed-script.cjs'));
  const report = {build, status: 'incomplete', sourceOnlyHarness: true, startsBrowser: false, navigates: false, triggerSit, playbackRateChanged: false, sourceParametersChanged: false};
  let installed = false, failure;
  try {
    const {verifyCandidate} = require(path.resolve(__dirname, '../../scripts/qa-m1-common.cjs'));
    report.identity = await verifyCandidate(page, {build, assetId: 'beta-base-female-m1', sha256: BODY});
    report.fit = await page.evaluate(async ({hair, fitSha}) => {
      const appearance = __debug.avatar().appearance.getState();
      if (appearance.replacementSHA256 !== hair || appearance.effectiveHairStyle !== 'female-ponytail-v1' || !appearance.hairDynamics?.enabled) throw Error('Exact active ponytail dynamics required');
      const response = await fetch('/assets/m2-long-hair-rootjoin-v2/fit.json', {cache: 'no-store'});
      if (!response.ok) throw Error('Fit HTTP '+response.status);
      const data = await response.arrayBuffer(), hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(v => v.toString(16).padStart(2, '0')).join('');
      if (hash !== fitSha) throw Error('Exact source fit SHA mismatch');
      return JSON.parse(new TextDecoder().decode(data));
    }, {hair: HAIR, fitSha: FIT});
    report.installed = await page.evaluate(installCaptureInPage, {fit: report.fit, stopAfterMs}); installed = true;
    if (triggerSit) report.action = await page.evaluate(() => __debug.action('sit'));
    await page.waitForFunction(() => window.__hairSeatFeasibilityCapture?.status().done, null, {timeout: 25000});
    report.status = 'captured';
  } catch (error) { failure = error; report.error = String(error); }
  finally {
    if (installed) try { report.capture = await page.evaluate(finishCaptureInPage); } catch (error) { report.restoreError = String(error); }
    if (!report.capture?.wrappersRestored || report.capture.observationErrors.length) report.status = 'incomplete';
    report.limits = ['Full per-call observation adds CPU/allocation overhead. This capture supplies causal queries, not a performance measurement or visual pass.', 'No gravity, radii, center, playback speed or controller changes.'];
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2)+'\n');
  }
  if (failure) throw failure;
  if (report.status !== 'captured') throw Error('Capture incomplete; inspect saved report');
  return report;
}

module.exports = {capture, installCaptureInPage, finishCaptureInPage};
if (require.main === module) (async () => {
  const args = Object.fromEntries(process.argv.slice(2).filter(v => v.startsWith('--') && v.includes('=')).map(v => v.slice(2).split(/=(.*)/s).slice(0, 2)));
  if (!args.cdp || !args.url || !args.build || !args.out || !args.modules) throw Error('Use --cdp=... --url=existing-page-prefix --build=12hex --out=fresh-directory --modules=prototype/node_modules [--trigger-sit]');
  const {chromium} = require(path.resolve(args.modules, 'playwright'));
  const browser = await chromium.connectOverCDP(args.cdp);
  const pages = browser.contexts().flatMap(context => context.pages()).filter(page => page.url().startsWith(args.url));
  if (pages.length !== 1) throw Error('Exactly one matching existing page required');
  const result = await capture(pages[0], {build: args.build, out: path.resolve(args.out), triggerSit: process.argv.includes('--trigger-sit')});
  console.log(JSON.stringify({status: result.status, frames: result.capture.frames.length, wrappersRestored: result.capture.wrappersRestored}));
  // Exit this CDP client only. The caller-owned remote browser stays open.
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
