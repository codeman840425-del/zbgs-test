// Candidate-only glasses chain. It never writes a formal admission report.
const {chromium} = require('../prototype/node_modules/playwright');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

const [base, outputDir] = process.argv.slice(2);
if (!base || !outputDir) throw new Error('usage: node qa-native-glasses-candidate-chain.cjs BASE OUTPUT_DIR');

const cases = [
  ['native-contour-roundness-a-v1', '825a82c944636971304ce50b7526b1410ea6f1c6b58bd36f166515295696a547'],
  ['native-contour-cheek-b-v1', '9592933507b3290100d82ac315e5ddac7b6e284f372a1368de9f424643846ddb'],
];

(async () => {
  const out = path.resolve(outputDir);
  await fs.mkdir(out, {recursive: false});
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const report = {
    schema: 'native-glasses-candidate-chain-v1',
    status: 'candidate-only',
    scope: 'Exact-body glasses candidate normal-speed room chain and fresh-page reload',
    cases: [],
    errors: [],
    limits: ['No human visual admission', 'No ordinary-PC performance admission', 'No formal runtime registry write'],
  };
  try {
    for (const [body, bodySHA256] of cases) {
      const context = await browser.newContext({
        viewport: {width: 1440, height: 1000},
        recordVideo: {dir: out, size: {width: 1440, height: 1000}},
      });
      let page;
      const row = {body, bodySHA256, errors: [], snapshots: [], closeReopen: false};
      try {
        page = await context.newPage();
        page.on('pageerror', error => { row.errors.push(String(error)); report.errors.push(`${body}: ${error}`); });
        page.on('console', message => {
          if (message.type() === 'error') { row.errors.push(message.text()); report.errors.push(`${body}: ${message.text()}`); }
        });
        const url = `${base}?workbench=appearance&glassesFit=candidate&body=${encodeURIComponent(body)}`;
        await page.goto(url);
        await page.waitForFunction(() => window.__debug?.ready, null, {timeout: 60000});
        const apply = await page.evaluate(async () => {
          const result = await __debug.avatar().livePresentation.setAccessory('glasses', true);
          return {result, state: __debug.avatar().livePresentation.getState(), build: __debug.buildInfo};
        });
        assert.equal(apply.result.applied, true, JSON.stringify(apply.result));
        assert.equal(apply.state.accessories.glasses.loaded, true);
        row.build = apply.build;
        row.fit = apply.result.identity?.fit;
        row.snapshots.push({name: 'glasses-on', state: apply.state});
        await page.evaluate(() => { __debug.camera('room'); __debug.setPlaybackRate(1); __debug.setPaused(false); });
        await page.evaluate(() => __debug.walkTo(-0.5, 1.8));
        await page.waitForTimeout(2600);
        const capture = () => page.evaluate(() => ({
          snapshot: __debug.snapshot(),
          accessories: __debug.avatar().livePresentation.getState().accessories,
        }));
        row.snapshots.push({name: 'walking', state: await capture()});
        await page.evaluate(() => __debug.action('sit'));
        await page.waitForFunction(() => __debug.snapshot().mode === 'sit' && __debug.snapshot().motion.sitProgress > .99, null, {timeout: 30000});
        row.snapshots.push({name: 'seated', state: await capture()});
        await page.evaluate(() => __debug.action('stand'));
        await page.waitForFunction(() => __debug.snapshot().motion.sitProgress < .01 && __debug.snapshot().motion.transitionComplete, null, {timeout: 20000});
        row.snapshots.push({name: 'standing-again', state: await capture()});
        const video = page.video();
        await page.close();
        if (video) await video.saveAs(path.join(out, `${body}-normal1x.webm`));

        page = await context.newPage();
        page.on('pageerror', error => { row.errors.push(String(error)); report.errors.push(`${body} reload: ${error}`); });
        await page.goto(url);
        await page.waitForFunction(() => window.__debug?.ready, null, {timeout: 60000});
        const reload = await page.evaluate(async () => {
          const result = await __debug.avatar().livePresentation.setAccessory('glasses', true);
          return {result, state: __debug.avatar().livePresentation.getState()};
        });
        assert.equal(reload.result.applied, true, JSON.stringify(reload.result));
        assert.equal(reload.state.accessories.glasses.loaded, true);
        row.closeReopen = true;
        row.reload = {fit: reload.result.identity?.fit, state: reload.state};
      } catch (error) {
        row.status = 'failed';
        row.failure = String(error.stack || error);
        report.status = 'failed';
        process.exitCode = 1;
      } finally {
        await page?.close().catch(() => {});
        await context.close();
      }
      report.cases.push(row);
    }
  } finally {
    await browser.close();
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  }
  if (report.errors.length || report.status === 'failed') process.exitCode = 1;
  console.log(JSON.stringify({status: report.status, cases: report.cases.length, errors: report.errors.length, out}));
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
