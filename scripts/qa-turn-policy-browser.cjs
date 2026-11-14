// Actual loaded room checks; planner-only tests cannot validate shoe transforms.
const { chromium } = require('../prototype/node_modules/playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
(async () => {
  const out = path.resolve(process.argv[3] || 'output/playwright/turn-policy');
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const reports = [];
  try {
    for (const legacy of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, recordVideo: { dir: out, size: { width: 1280, height: 900 } } });
      const page = await context.newPage(); const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      const url = new URL(process.argv[2] || 'http://127.0.0.1:5173');
      if (legacy) url.searchParams.set('turnLegacy', '');
      await page.goto(url.href); await page.waitForFunction(() => window.__debug?.ready && window.__debug.buildInfo?.shortId, null, { timeout: 90000 });
      const build = await page.evaluate(() => window.__debug.buildInfo);
      if (process.argv[4] && build.shortId !== process.argv[4]) throw Error('Unexpected fixed build: ' + build.shortId);
      const result = await page.evaluate((legacy) => {
        const d = window.__debug, c = d.game.scene.getScene('CharacterStudio'), results = [];
        c.paused = true;
        function trial(name, start, interrupt, interruptAt = .27) {
          c.reset(); c.paused = true; start();
          let previous = null, maxSupportPositionStep = 0, maxSupportAngleStep = 0, firstResponse = null, turnEnd = null;
          let clampFrames = 0, interrupted = false;
          for (let i = 0; i < 1200; i++) {
            if (interrupt && !interrupted && i / 120 >= interruptAt) { interrupt(); interrupted = true; }
            c.simulate(1 / 120);
            const s = d.snapshot(), v = d.avatar().vrm;
            const feet = s.feet.map((f) => {
              const b = v.humanoid.getRawBoneNode(f.side + 'Foot');
              return { contact: f.contact, p: b.getWorldPosition(b.position.clone()).toArray(), q: b.getWorldQuaternion(b.quaternion.clone()).toArray() };
            });
            if (firstResponse === null && Math.abs(s.facing) > 1e-5) firstResponse = (i + 1) / 120;
            if (s.motion.turning) {
              clampFrames += s.feet.filter((f) => f.reachClamp).length;
              if (previous?.turning) feet.forEach((f, j) => {
                const old = previous.feet[j]; if (!(f.contact && old.contact)) return;
                maxSupportPositionStep = Math.max(maxSupportPositionStep, Math.hypot(...f.p.map((v, k) => v - old.p[k])));
                const dot = Math.min(1, Math.abs(f.q.reduce((sum, v, k) => sum + v * old.q[k], 0)));
                maxSupportAngleStep = Math.max(maxSupportAngleStep, 2 * Math.acos(dot));
              });
            }
            if (turnEnd === null && firstResponse !== null && !s.turnPlan.active && (legacy ? c.turnRemaining <= 0 && !c.pathTurn : true)) turnEnd = (i + 1) / 120;
            previous = { feet, turning: s.motion.turning };
            if (name === '360' && c.mode === 'idle' && !s.turnPlan.active && i > 2) break;
            if (name === 'queue sit' && s.mode === 'sit' && s.motion.transitionComplete) break;
            if (name !== '360' && name !== 'queue sit' && i >= 360) break;
          }
          const s = d.snapshot();
          results.push({ name, firstResponse, turnEnd, facing: s.facing, position: s.position, mode: s.mode, pending: s.pending, active: s.turnPlan.active, maxSupportPositionStep, maxSupportAngleStep, clampFrames });
        }
        trial('360', () => c.action('turn'));
        if (!legacy) {
          trial('180 path', () => c.go(-.5, -.75));
          trial('reselect', () => c.action('turn'), () => c.go(-2, 1.15));
          trial('stop', () => c.action('turn'), () => c.action('idle'));
          trial('queue dance', () => c.action('turn'), () => c.action('dance'));
          trial('walking reverse', () => c.go(-.5, 2.8), () => c.go(-.5, -.75), 1);
          trial('queue sit', () => c.action('turn'), () => c.action('sit'));
        }
        return { legacy, asset: d.snapshot().inspection.asset, results };
      }, legacy);
      result.errors = errors;
      result.build = build;
      result.url = url.href;
      await page.evaluate(() => { const d = window.__debug; d.reset(); d.camera('close'); d.setPaused(false); d.action('turn'); });
      await page.waitForTimeout(legacy ? 8500 : 3000);
      await page.screenshot({ path: path.join(out, legacy ? 'legacy-end.png' : 'planned-end.png') });
      const video = page.video(); await context.close();
      await video.saveAs(path.join(out, legacy ? 'legacy-turn.webm' : 'planned-turn.webm'));
      reports.push(result);
    }
    await fs.writeFile(path.join(out, 'runtime.json'), JSON.stringify(reports, null, 2));
    console.log(JSON.stringify(reports.map(({ asset, ...r }) => ({ ...r, assetIdentity: asset?.identity ?? asset?.source })), null, 2));
    const fast = reports.find((r) => !r.legacy);
    const full = fast.results.find((r) => r.name === '360');
    const half = fast.results.find((r) => r.name === '180 path');
    const queued = fast.results.find((r) => r.name === 'queue dance');
    const stopped = fast.results.find((r) => r.name === 'stop');
    const seated = fast.results.find((r) => r.name === 'queue sit');
    if (reports.some((r) => r.errors.length) || !(full.turnEnd < 2.6 && half.turnEnd >= 1 && half.turnEnd <= 1.5)
        || queued.mode !== 'dance' || stopped.active || stopped.mode !== 'idle' || seated.mode !== 'sit'
        || fast.results.some((r) => r.maxSupportAngleStep > .001 || r.maxSupportPositionStep > .001 || r.clampFrames)) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });
