const { chromium } = require('../prototype/node_modules/playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

const [base, recordFile, outputDir] = process.argv.slice(2);
if (!base || !recordFile || !outputDir) throw new Error('usage: node qa-native-dynamic-runtime.cjs BASE RECORD OUTPUT_DIR');

(async () => {
  const record = JSON.parse(await fs.readFile(recordFile, 'utf8'));
  const out = path.resolve(outputDir);
  await fs.mkdir(out, { recursive: false });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const report = { schema: 'native-dynamic-runtime-trace-v1', status: 'incomplete', bodySha256: record.appearanceRecipe?.base?.bodySha256, recordSha256: record.integrity?.recordSha256, samples: [], errors: [] };
  page.on('pageerror', e => report.errors.push(e.message));
  try {
    await page.goto(base + '?workbench=appearance&body=' + encodeURIComponent(record.appearanceRecipe.base.bodyType));
    await page.waitForFunction(() => window.__debug?.ready, null, { timeout: 90000 });
    const restored = await page.evaluate(r => __debug.restoreCharacterRecord(r), record);
    assert.equal(restored.applied, true, JSON.stringify(restored));
    await page.evaluate(() => { __debug.camera('room'); __debug.setPlaybackRate(1); __debug.setPaused(false); });
    const capture = async (label, seconds) => {
      await page.evaluate(({ label }) => { window.__dynamicTrace = { label, rows: [], started: performance.now() }; }, { label });
      const until = Date.now() + seconds * 1000;
      while (Date.now() < until) {
        const row = await page.evaluate(() => {
          const s = __debug.snapshot();
          return { ready:s.ready, build:s.buildInfo?.shortId, bodyType:s.bodySelection?.bodyType,
            mode:s.mode, outfit:s.outfitInfo?.name, dynamics:s.inspection?.dynamics,
            position:s.position, facing:s.facing, speed:s.speed, simulationTime:s.simulationTime,
            motion:{phase:s.motion?.phase, feet:s.motion?.feet, peakSlip:s.motion?.peakSlip,
              frame:s.motion?.frame, walkDuration:s.motion?.sourceClips?.walkDuration},
            hairDynamics:s.appearance?.hairDynamics ?? null,
            frameMs:s.frameMs, renderSubmitMs:s.renderSubmitMs,
            renderer:{textures:s.renderer?.textures, geometries:s.renderer?.geometries, triangles:s.renderer?.triangles},
            heap:s.heap };
        });
        report.samples.push({ label, t: performance.now(), row });
        await page.waitForTimeout(33);
      }
    };
    await page.evaluate(() => __debug.walkTo(-0.5, 1.8));
    await capture('walk-dynamics-on', 2.5);
    await page.evaluate(() => __debug.action('sit'));
    await capture('sit-dynamics-on', 2.0);
    await page.evaluate(() => __debug.action('stand'));
    await capture('stand-dynamics-on', 2.0);
    await page.evaluate(() => { __debug.setDynamics(false); __debug.walkTo(-1.4, 1.7); });
    await capture('walk-dynamics-off', 2.5);
    const final = await page.evaluate(identity => __debug.captureCharacterRecord({ identity }), record.identity);
    report.finalRecordSha256 = final.integrity?.recordSha256;
    report.dynamicStates = [...new Set(report.samples.map(s => s.row.appearance?.hairDynamics?.method).filter(Boolean))];
    report.status = report.errors.length ? 'failed' : 'technical-pass-diagnostic-only';
  } catch (error) {
    report.status = 'failed'; report.failure = String(error.stack || error); process.exitCode = 1;
  } finally {
    await page.screenshot({ path: path.join(out, 'last-frame.png') }).catch(() => {});
    await browser.close();
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ status: report.status, samples: report.samples.length, errors: report.errors.length }));
  }
})();
