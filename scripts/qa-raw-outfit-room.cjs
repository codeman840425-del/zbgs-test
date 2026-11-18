// Measure source and independent garment separately from the normal-speed recording.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const {sampleRawSourceSurfaces} = require('./qa-raw-source-surfaces.cjs');
const {seatedContact} = require('./qa-seated-outfit-contact.cjs');
const {productionRoot, projectOutput} = require('./project-output.cjs');

async function main() {
  const [base, expectedBuild, recordPath, directory] = process.argv.slice(2);
  const out = await projectOutput(directory, await productionRoot());
  const record = JSON.parse(await fs.readFile(recordPath, 'utf8'));
  await fs.mkdir(out, {recursive:false});
  const report = {expectedBuild, recordSha256:record.integrity.recordSha256, samples:[], errors:[]};
  const {chromium} = require('../prototype/node_modules/playwright');
  const browser = await chromium.launch({channel:'chrome', headless:true});
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => report.errors.push(e.message));
    const url = new URL(base);
    url.searchParams.set('workbench','appearance');
    url.searchParams.set('view','inspect-full-side');
    url.searchParams.set('body',record.appearanceRecipe.base.bodyType);
    await page.goto(url.href);
    await page.waitForFunction(() => window.__debug?.ready, null, {timeout:90000});
    assert.equal(await page.evaluate(() => __debug.buildInfo.shortId), expectedBuild);
    assert.equal((await page.evaluate(r => __debug.restoreCharacterRecord(r), record)).applied, true);
    const sample = async label => report.samples.push(await sampleRawSourceSurfaces(page,
      {label, sampleCount:3, intervalMs:45, expectedBuild}));
    const request = (kind,payload={}) => page.evaluate(r => __debug.request(r),{requestId:kind,kind,payload});
    const complete = async id => {
      await page.waitForFunction(id => ['completed','failed','cancelled'].includes(__debug.tasks().get(id)?.state),id,{timeout:45000});
      assert.equal(await page.evaluate(id => __debug.tasks().get(id).state,id),'completed');
    };
    const transitioning = () => page.waitForFunction(() => {
      const p = __debug.snapshot().motion.sitProgress;
      return p > 0.10 && p < 0.85;
    }, null, {polling:'raf',timeout:20000});
    await sample('standing');
    await request('walk',{x:1.2,z:1.8});
    await page.waitForFunction(() => __debug.snapshot().motion.gait > 0.3);
    await sample('walking');
    await complete('walk');
    await request('sit');
    await transitioning();
    await sample('sitting-down');
    await complete('sit');
    await sample('seated');
    report.seatedContact = await page.evaluate(seatedContact);
    assert.ok(report.seatedContact.bottomVerticesOverSeat > 0 && report.seatedContact.soleMinimumY !== null);
    await page.screenshot({path:path.join(out,'seated.png')});
    await request('stand');
    await transitioning();
    await sample('rising');
    await complete('stand');
    await sample('risen');
    assert.deepEqual(report.errors, []);
    report.status = 'sampled';
  } catch (error) {
    report.error = error.stack;
    throw error;
  } finally {
    await browser.close();
    await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  }
}
main().catch(error => {console.error(error);process.exitCode=1;});
