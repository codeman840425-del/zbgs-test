// Bounded M2 male face readback: fixed identity, static actual live expressions,
// followed by separate normal 1x room films. No runtime imports or injected morphs.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { verifyCandidate, prepareOutput, writeFailure } = require('./qa-m1-common.cjs');
const profilePath = path.resolve('assets-source/m2-male-face-v1/generated/profile-entry.json');
const states = ['neutral', 'blink', 'aa', 'happy', 'gaze-left', 'gaze-right'];
const plan = {
  cases: ['male', 'm2-male-jaw-v1'], states, views: ['front', 'side'],
  static: 'Paused fixed-step preparation through the existing live layer. Actual raw head/eyes define camera target; common root-local offsets. Not normal-speed evidence.',
  video: 'Separate fresh page per identity, 1440x900, room, 1x, dynamics on. Long trousers walk/stop -> shorts -> real chair approach/sit/stand -> walk/stop. No reset/advance/simulate in video chain.',
  excluded: ['mic', 'glasses', 'dance', 'body geometry audit', 'performance acceptance'],
};
if (process.argv.includes('--plan')) { console.log(JSON.stringify(plan, null, 2)); process.exit(0); }

(async () => {
  const base = process.argv[2], build = process.env.QA_M1_BUILD;
  assert(/^http:\/\/127\.0\.0\.1:\d+\/$/.test(base || ''), 'Use run-fixed-check loopback URL');
  assert(/^[a-f0-9]{12}$/.test(build || ''), 'Explicit QA_M1_BUILD required');
  const profile = JSON.parse(await fs.readFile(profilePath, 'utf8'));
  assert.equal(profile.id, 'm2-male-jaw-v1');
  assert.equal(profile.referenceBody, 'male');
  assert.equal(profile.sha256, '25ac8a8174110d7b0a6bb290ac8cab66ad6939ea522f80cdef62571d2ab24153');
  const cases = [
    { body: 'male', assetId: 'beta-base-male-m1b', sha256: '62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff' },
    { body: profile.id, assetId: profile.id, sha256: profile.sha256 },
  ];
  const out = await prepareOutput(build, 'male-face-readback');
  const report = { build, plan, profile, cases: [], visualReview: 'pending' };
  const { chromium } = require('../prototype/node_modules/playwright');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const save = () => fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  async function open(context, cfg, result) {
    const page = await context.newPage();
    page.on('pageerror', error => result.errors.push(String(error)));
    await page.goto(base + '?body=' + encodeURIComponent(cfg.body));
    await page.waitForFunction(() => window.__debug?.ready, null, { timeout: 60000 });
    const receipt = await verifyCandidate(page, { build, ...cfg });
    await page.evaluate(() => {
      const d = __debug;
      d.setPlaybackRate(1); d.setCorrections('full'); d.setBodyMode('dressed');
      d.setHelpers(false); d.setDynamics(true); d.setOutfit(0);
      d.command({ type: 'speaking', value: false }); d.command({ type: 'gaze', target: null });
      d.command({ type: 'expression', name: 'neutral' });
      d.game.scene.getScene('CharacterStudio').cameraPreset('room', true);
    });
    return { page, receipt };
  }
  try {
    for (const cfg of cases) {
      const dir = path.join(out, cfg.body); await fs.mkdir(dir, { recursive: true });
      const result = { config: cfg, errors: [], faces: [], tasks: [] }; report.cases.push(result);
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      try {
        const { page, receipt } = await open(context, cfg, result); result.staticIdentity = receipt;
        await page.evaluate(() => __debug.setPaused(true));
        for (const state of states) {
          const capture = await page.evaluate(state => {
            const d = __debug, a = d.avatar(), c = d.game.scene.getScene('CharacterStudio');
            const V = a.root.position.constructor, Q = a.root.quaternion.constructor;
            const raw = n => a.vrm.humanoid.getRawBoneNode(n), live = a.livePresentation;
            if (!raw('head') || !raw('leftEye') || !raw('rightEye')) throw Error('Actual head/eye bones required; no fixed-height fallback');
            live.setSpeaking(false); live.setExpression(['happy', 'aa'].includes(state) ? state : 'neutral'); live.setGaze(null);
            a.root.updateMatrixWorld(true);
            const rootQ = a.root.getWorldQuaternion(new Q());
            if (state.startsWith('gaze-')) {
              const head = raw('head').getWorldPosition(new V());
              live.setGaze(head.add(new V(state === 'gaze-left' ? -1 : 1, 0, 1).applyQuaternion(rootQ)));
            }
            // Exercise the product's automatic blink cycle, never set raw expression weights.
            const now = live.getState().time, target = (Math.floor(now / 3.6) + 1) * 3.6 + (state === 'blink' ? .09 : .3);
            let remaining = target - now;
            while (remaining > 1e-10) { const dt = Math.min(1 / 120, remaining); c.simulate(dt); remaining -= dt; }
            a.root.updateMatrixWorld(true);
            const head = raw('head').getWorldPosition(new V());
            const eyeL = raw('leftEye').getWorldPosition(new V()), eyeR = raw('rightEye').getWorldPosition(new V());
            const targetPoint = eyeL.clone().add(eyeR).multiplyScalar(.5).add(new V(0, -.035, 0).applyQuaternion(rootQ));
            const expression = Object.fromEntries(['blink', 'aa', 'happy'].map(k => [k, a.vrm.expressionManager.getValue(k)]));
            if (state === 'blink' ? expression.blink < .99 : expression.blink > .001) throw Error('Actual blink phase not reached');
            if (state === 'aa' && expression.aa < .64 || state === 'happy' && expression.happy < .64) throw Error('Actual expression not applied');
            const views = [];
            for (const [view, offset] of [['front', [0, 0, .65]], ['side', [.65, 0, 0]]]) {
              const camera = d.cameraObject().clone(); camera.fov = 30;
              camera.position.copy(targetPoint).add(new V(...offset).applyQuaternion(rootQ));
              camera.lookAt(targetPoint); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
              d.renderer.render(d.scene, camera);
              views.push({ view, rootLocalOffset: offset, camera: camera.position.toArray(), quaternion: camera.quaternion.toArray(), target: targetPoint.toArray(), fov: camera.fov, png: d.renderer.domElement.toDataURL('image/png').split(',')[1] });
            }
            return { state, head: head.toArray(), eyes: [eyeL.toArray(), eyeR.toArray()], expression, live: live.getState(), simulationTime: d.snapshot().simulationTime, views };
          }, state);
          for (const view of capture.views) { await fs.writeFile(path.join(dir, `${state}-${view.view}.png`), Buffer.from(view.png, 'base64')); delete view.png; }
          result.faces.push(capture);
        }
        result.staticFinalIdentity = await verifyCandidate(page, { build, ...cfg });
        if (cfg.body !== 'male') {
          result.unsupportedAccessories = await page.evaluate(async () => {
            const rows = [];
            for (const kind of ['mic', 'glasses']) {
              let response = null, error = null;
              try { response = await __debug.command({ type: 'accessory', kind, value: true }); }
              catch (e) { error = String(e); }
              const state = __debug.avatar().livePresentation.getState().accessories[kind];
              rows.push({ kind, response, error, state });
              if (state.loaded || state.requested) await __debug.command({ type: 'accessory', kind, value: false });
            }
            return rows;
          });
          assert(result.unsupportedAccessories.every(x => !x.state.loaded && !x.state.requested && (x.error || x.response?.applied === false)), 'Unsupported accessory did not explicitly reject/clean up');
        }
      } finally { await context.close(); await save(); }

      const videoContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, recordVideo: { dir, size: { width: 1440, height: 900 } } });
      let page, video;
      try {
        const opened = await open(videoContext, cfg, result); page = opened.page; video = page.video(); result.videoIdentity = opened.receipt;
        await page.evaluate(() => {
          const d = __debug; d.setPaused(false);
          const q = window.__maleFaceChain = { running: true, rows: [], last: null };
          function frame(now) {
            if (!q.running) return;
            const s = d.snapshot();
            q.rows.push({ wallMs: now, dt: q.last === null ? null : now - q.last, simulationTime: s.simulationTime, mode: s.mode, root: s.position, outfit: s.outfit, camera: s.camera, sit: s.motion.sitProgress, active: d.tasks().active(), live: d.avatar().livePresentation.getState() });
            q.last = now; requestAnimationFrame(frame);
          }
          requestAnimationFrame(frame);
        });
        async function task(requestId, kind, payload = {}) {
          await page.evaluate(req => __debug.request(req), { requestId, kind, payload });
          await page.waitForFunction(id => ['completed', 'failed', 'cancelled'].includes(__debug.tasks().get(id)?.state), requestId, { timeout: 45000 });
          const record = await page.evaluate(id => __debug.tasks().get(id), requestId);
          result.tasks.push(record); assert.equal(record.state, 'completed', requestId);
        }
        await page.evaluate(() => __debug.setSpeed(.85));
        await task('trousers-walk-stop', 'walk', { x: .3, z: 1.8 }); await page.waitForTimeout(600);
        await page.locator('[data-outfit="2"]').click();
        assert.equal(await page.evaluate(() => __debug.snapshot().outfit), 2);
        await task('shorts-sit', 'sit'); await page.waitForTimeout(1000);
        await task('shorts-stand', 'stand');
        await task('shorts-walk-stop', 'walk', { x: .3, z: 1.8 }); await page.waitForTimeout(600);
        const final = await page.evaluate(() => ({ snapshot: __debug.snapshot(), live: __debug.avatar().livePresentation.getState(), active: __debug.tasks().active() }));
        assert.equal(final.snapshot.mode, 'idle'); assert.equal(final.active, null);
        assert(Object.values(final.live.accessories).every(x => !x.loaded && !x.requested), 'No unadapted accessory permitted');
        result.final = final; result.videoFinalIdentity = await verifyCandidate(page, { build, ...cfg });
      } finally {
        if (page) result.frames = await page.evaluate(() => { const q = window.__maleFaceChain; if (!q) return []; q.running = false; return q.rows; }).catch(() => []);
        await videoContext.close();
        if (video) await video.saveAs(path.join(dir, 'walk-stop-sit-rise-1x.webm'));
        await save();
      }
      assert(result.frames?.length, 'Missing actual video frame trace');
      const reference = JSON.stringify(result.frames[0].camera);
      assert(result.frames.every(f => JSON.stringify(f.camera) === reference), 'Room camera changed during normal chain');
      assert.equal(result.errors.length, 0, 'Page error'); result.passed = true; await save();
    }
  } catch (error) { await writeFailure(out, error); throw error; }
  finally { await browser.close(); await save(); console.log(out); }
})().catch(error => { console.error(error); process.exitCode = 1; });
