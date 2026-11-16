const { chromium } = require('../prototype/node_modules/playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { verifyCandidate } = require('./qa-m1-common.cjs');
const out = path.resolve('evidence/m2-inspection-camera-8e2926da4939-v1');
(async () => {
  await fs.mkdir(out, { recursive: false });
  await fs.copyFile(__filename, path.join(out, 'executed-script.cjs'));
  const report = { build: '8e2926da4939', sourceCommit: 'b55053d', errors: [], cases: [] };
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', error => report.errors.push(String(error)));
    await page.goto('http://127.0.0.1:4295/?body=male&workbench=appearance&view=room');
    await page.waitForFunction(() => window.__debug?.ready, null, { timeout: 60000 });
    report.identity = await verifyCandidate(page, { build: report.build, assetId: 'beta-base-male-m1b', sha256: '62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff' });
    await page.evaluate(() => { __debug.setOutfit(3); __debug.setSpeed(1.05); __debug.walkTo(2, 1.8); });
    const idle = () => page.waitForFunction(() => { const s = __debug.snapshot(); return s.mode === 'idle' && !s.target && !s.pending; }, null, { timeout: 30000 });
    await idle();
    await page.evaluate(() => __debug.walkTo(-.5, 1.8));
    await idle();
    await page.evaluate(() => { __debug.setPaused(true); __debug.view('inspect-full-front'); });
    await page.waitForTimeout(300);
    report.naturalArrival = await page.evaluate(() => __debug.snapshot());
    assert(report.naturalArrival.camera.position[0] < -4.5);
    // Reproduce the former wall occlusion at exactly the same character/camera pose.
    await page.evaluate(() => { for (const name of ['InspectionBackWall', 'InspectionLeftWall']) __debug.scene.getObjectByName(name).traverse(n => { if (n.material) n.material.clippingPlanes = null; }); __debug.renderer.render(__debug.scene, __debug.cameraObject()); });
    await page.screenshot({ path: path.join(out, 'before-left-wall.png') });
    await page.evaluate(() => __debug.view('inspect-full-front'));
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(out, 'after-left-wall.png') });
    const actorState = await page.evaluate(() => ({ position: __debug.avatar().root.position.toArray(), rotation: __debug.avatar().root.rotation.y, scale: __debug.avatar().root.scale.toArray(), outfit: __debug.avatar().getOutfitInfo() }));
    for (const yaw of [0, -Math.PI / 2, Math.PI, Math.PI / 2]) {
      // Paused synthetic orientation coverage supplements the real walking arrival.
      await page.evaluate(y => { __debug.avatar().root.rotation.y = y; }, yaw);
      for (const framing of ['face', 'half', 'full']) for (const direction of ['front', 'side', 'back']) {
        const view = `inspect-${framing}-${direction}`;
        await page.evaluate(v => __debug.view(v), view);
        await page.waitForTimeout(70);
        const row = await page.evaluate(() => {
          const d = __debug, camera = d.cameraObject();
          const wall = name => { const materials = []; d.scene.getObjectByName(name).traverse(n => { if (n.material) materials.push({ clipped: !!n.material.clippingPlanes?.length, clipShadows: n.material.clipShadows }); }); return materials; };
          return { snapshot: d.snapshot(), position: d.avatar().root.position.toArray(), scale: d.avatar().root.scale.toArray(), left: wall('InspectionLeftWall'), back: wall('InspectionBackWall') };
        });
        const [x,, z] = row.snapshot.camera.position;
        assert(row.left.every(m => m.clipped === (x <= -4.3) && !m.clipShadows));
        assert(row.back.every(m => m.clipped === (z <= -3.3) && !m.clipShadows));
        assert.deepEqual(row.position, actorState.position);
        assert.deepEqual(row.scale, actorState.scale);
        if (framing === 'full') await page.screenshot({ path: path.join(out, `yaw-${Math.round(yaw * 180 / Math.PI)}-${direction}.png`) });
        report.cases.push({ yaw, view, ...row });
      }
    }
    await page.evaluate(y => { __debug.avatar().root.rotation.y = y; __debug.camera('room'); }, actorState.rotation);
    await page.waitForTimeout(700);
    report.restored = await page.evaluate(() => { const d = __debug, clips = []; d.scene.traverse(n => { if (n.material?.clippingPlanes?.length) clips.push(n.uuid); }); return { state: d.snapshot(), clips, outfit: d.avatar().getOutfitInfo() }; });
    assert.equal(report.restored.clips.length, 0);
    assert.deepEqual(report.restored.state.camera.position, [5.8, 4.5, 7.8]);
    assert.deepEqual(report.restored.outfit, actorState.outfit);
    await page.screenshot({ path: path.join(out, 'restored-room.png') });
    assert.equal(report.errors.length, 0);
    report.status = 'scoped-technical-checks-passed-visual-review-required';
  } finally {
    await browser.close();
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
