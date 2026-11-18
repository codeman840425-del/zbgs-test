// Exercise candidate-only glasses fits in the real fixed browser runtime.
// This deliberately never produces an admission report.
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('../prototype/node_modules/playwright');

const base = process.argv[2];
const output = path.resolve(process.argv[3] || `output/playwright/m2/native-glasses-runtime-${Date.now()}`);
const cases = [
  ['native-contour-roundness-a-v1', '825a82c944636971304ce50b7526b1410ea6f1c6b58bd36f166515295696a547'],
  ['native-contour-cheek-b-v1', '9592933507b3290100d82ac315e5ddac7b6e284f372a1368de9f424643846ddb'],
];
if (!base) throw Error('fixed runtime URL required');

(async () => {
  await fs.mkdir(output, {recursive: true});
  const browser = await chromium.launch({channel: 'chrome', headless: true});
  const report = {schema: 'native-glasses-candidate-runtime-v1', status: 'candidate-only', cases: [], errors: []};
  try {
    for (const [body, bodySHA256] of cases) {
      const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
      page.on('pageerror', error => report.errors.push(`${body}: ${error}`));
      await page.goto(`${base}?workbench=appearance&glassesFit=candidate&body=${body}`);
      await page.waitForFunction(() => window.__debug?.ready, null, {timeout: 60000});
      const stand = await page.evaluate(async expected => {
        const avatar = __debug.avatar();
        const result = await avatar.livePresentation.setAccessory('glasses', true);
        return {result, state: avatar.livePresentation.getState(), build: __debug.buildInfo};
      }, bodySHA256);
      await page.screenshot({path: path.join(output, `${body}-stand.png`)});
      const sit = await page.evaluate(() => {
        const controller = __debug.game.scene.getScene('CharacterStudio');
        __debug.setPaused(true);
        controller.action('sit');
        for (let i = 0; i < 1200; i++) controller.simulate(1 / 120);
        const state = __debug.avatar().livePresentation.getState();
        return {state, sitProgress: __debug.motion().getMetrics().sitProgress};
      });
      await page.screenshot({path: path.join(output, `${body}-sit.png`)});
      report.cases.push({body, bodySHA256, stand, sit});
      await page.close();
    }
  } finally {
    await browser.close();
    report.errors = report.errors;
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  }
  if (report.errors.length) throw Error(report.errors.join('\n'));
  console.log(output);
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
