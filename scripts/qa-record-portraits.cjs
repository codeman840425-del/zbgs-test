// Reopen two signed game records at the same inspection camera and save their actual room renders.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {productionRoot, projectOutput} = require('./project-output.cjs');
const {launchQABrowser} = require('./qa-browser-workspace.cjs');

async function run(base, build, recordFile, directory) {
  const out = await projectOutput(directory, await productionRoot());
  const records = JSON.parse(await fs.readFile(recordFile, 'utf8'));
  assert.equal(records.length, 2);
  assert.equal(new Set(records.map(r => r.identity.id)).size, 2);
  assert.equal(records[0].appearanceRecipe.base.sha256, records[1].appearanceRecipe.base.sha256);
  await fs.mkdir(out, {recursive:false});
  const report = {build, captures:[], errors:[], passed:false};
  let session;
  try {
    session = await launchQABrowser(out, {channel:'chrome'});
    report.browser = session.browser.version();
    for (const [i, record] of records.entries()) {
      const context = await session.browser.newContext({viewport:{width:1440, height:920}});
      try {
        const page = await context.newPage();
        page.on('pageerror', error => report.errors.push(error.message));
        const url = new URL(base);
        url.search = new URLSearchParams({workbench:'appearance', body:record.appearanceRecipe.base.bodyType, view:'inspect-face-front'});
        await page.goto(url.href);
        await page.waitForFunction(() => window.__debug?.ready, null, {timeout:90000});
        assert.equal(await page.evaluate(() => __debug.buildInfo.shortId), build);
        const restored = await page.evaluate(r => __debug.restoreCharacterRecord(r), record);
        assert.equal(restored.applied, true, JSON.stringify(restored));
        const capture = await page.evaluate(async () => {
          __debug.setPaused(true);
          __debug.reset();
          __debug.setBodyMode('dressed');
          __debug.setDynamics(false);
          __debug.command({type:'speaking', value:false});
          const pose = __debug.advance(0.35);
          if (pose.mode !== 'idle' || pose.motion.sitProgress !== 0) throw Error('Expected standing pose');
          __debug.view('inspect-face-front');
          await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)));
          return {appearance:__debug.avatar().appearance.getState(), camera:__debug.snapshot().camera, poseTime:pose.simulationTime};
        });
        for (const [key, value] of Object.entries(record.appearanceRecipe.appearance))
          assert.equal(capture.appearance[key], value, key);
        if (i) for (const key of ['position','target']) assert.deepEqual(capture.camera[key], report.captures[0].camera[key]);
        const file = 'face-' + (i + 1) + '.png';
        await page.locator('#stage').screenshot({path:path.join(out,file)});
        report.captures.push({id:record.identity.id, sha256:record.integrity.recordSha256, file, ...capture});
      } finally { await context.close(); }
    }
    assert.deepEqual(report.errors, []);
    report.passed = true;
  } catch (error) {report.failure=String(error.stack || error);throw error;}
  finally {
    try {await session?.close();}
    finally {await fs.writeFile(path.join(out,'report.json'), JSON.stringify(report,null,2)+'\n');}
  }
}
run(...process.argv.slice(2)).catch(error => {console.error(error);process.exitCode=1;});
