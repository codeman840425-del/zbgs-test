// Verify the published extra-look buttons through the same UI the user opens.
const {productionRoot,projectOutput}=require('./project-output.cjs');
const {launchQABrowser}=require('./qa-browser-workspace.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const [build, destination] = process.argv.slice(2);
assert(/^[a-f0-9]{12}$/.test(build) && destination);
(async () => {
  const out = await projectOutput(destination, await productionRoot());
  await fs.mkdir(out, { recursive: false });
  await fs.copyFile(__filename, path.join(out, 'executed-script.cjs'));
  const report = { build, cases: [], errors: [], scope: 'Published UI selects new and original pants looks on three exact bodies; no new animation or performance acceptance.' };
  const {browser,close}=await launchQABrowser(out,{channel:'chrome'});
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', e => report.errors.push(String(e)));
    for (const body of ['female', 'female-round-full-v2', 'female-soft-wide-v2']) {
      const response = await page.goto('http://127.0.0.1:4196/?workbench=appearance&body=' + body);
      assert.equal((await response.allHeaders())['x-zbgs-candidate'], build);
      await page.waitForFunction(() => window.__debug?.ready && document.querySelector('#appearance-form')?.getAttribute('aria-busy') === 'false');
      assert.equal(await page.evaluate(() => __debug.buildInfo.shortId), build);
      const button = page.locator('[data-outfit="4"]');
      assert.equal(await button.count(), 1);
      const label = await button.locator('b').innerText();
      assert(label.includes('腰部修订对照'));
      await button.click();
      await page.waitForFunction(() => __debug.avatar().getOutfitInfo().index === 4);
      const fitted = await page.evaluate(() => __debug.avatar().getOutfitInfo());
      assert(fitted.equipment.bodyCoverage.activeItems.some(id => id.includes('vest-layer-fit')));
      await page.locator('[data-inspect-framing="half"]').click();
      await page.waitForTimeout(350);
      await page.locator('#stage').screenshot({ path: path.join(out, body + '-selected.png') });
      await page.locator('[data-outfit="0"]').click();
      await page.waitForFunction(() => __debug.avatar().getOutfitInfo().index === 0);
      const restored = await page.evaluate(() => __debug.avatar().getOutfitInfo());
      assert(!restored.equipment.bodyCoverage.activeItems.some(id => id.includes('vest-layer-fit')));
      report.cases.push({ body, label, fitted, restored });
    }
    assert.equal(report.errors.length, 0);
    report.status = 'passed-ui-state-only';
  } catch (error) {
    report.status = 'failed'; report.error = String(error.stack || error); process.exitCode = 1;
  } finally {
    await close();
    await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ status: report.status, cases: report.cases.length, error: report.error }));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
