const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('../prototype/node_modules/playwright');
const {productionRoot, projectOutput} = require('./project-output.cjs');

async function main() {
  const [base, build, expected, destination] = process.argv.slice(2);
  assert.ok(['original', 'repaired'].includes(expected) && /^[a-f0-9]{12}$/.test(build));
  const output = await projectOutput(destination, await productionRoot());
  await fs.mkdir(output);
  const browser = await chromium.launch({channel:'chrome', headless:true});
  const report = {build, expected, scope:'Representative room request routing, demo chair and actual task/lease state'};
  try {
    const page = await browser.newPage();
    const url = new URL(base);
    url.search = '?body=source-male-ab9a-release-v1&workbench=appearance';
    await page.goto(url.href);
    await page.waitForFunction(() => window.__debug?.ready);
    assert.equal(await page.evaluate(() => __debug.buildInfo.shortId),build);
    report.outcome = await page.evaluate(expected => {
      const d = window.__debug;
      d.setPaused(true);
      const explicit = {requestId:'sofa-left',kind:'sit',payload:{usePointId:'screen-partition-studio/ground/live/sofa#left'}};
      const demo = {requestId:'requested-demo',kind:'sit',payload:{usePointId:'room-chair-1'}};
      const rightful = expected === 'repaired' ? d.request(demo) : null;
      const result = d.request(explicit);
      const retry = d.request(explicit);
      const conflicting = d.request({...explicit,payload:{usePointId:'other-seat'}});
      for (let i=0;i<80;i++) d.advance(.25);
      return {rightful, result, retry, conflicting,
        requestedTask:d.tasks().get(explicit.requestId), demoTask:d.tasks().get(demo.requestId),
        intendedLease:d.seatLeases.forSeat(explicit.payload.usePointId),
        actualLease:d.seatLeases.forSeat('room-chair-1')};
    }, expected);
    const o = report.outcome;
    assert.equal(o.intendedLease,null);
    assert.equal(o.retry.duplicate,true);
    assert.equal(o.conflicting.reason,'request-id-conflict');
    assert.equal(o.actualLease.state,'occupied');
    if (expected === 'original') {
      assert.equal(o.requestedTask.state,'completed');
      assert.equal(o.actualLease.requestId,'sofa-left');
    } else {
      assert.equal(o.result.admission,'rejected');
      assert.equal(o.requestedTask.reason,'unknown-seat-use-point');
      assert.equal(o.demoTask.state,'completed');
      assert.equal(o.actualLease.requestId,'requested-demo');
    }
    report.status = expected === 'original' ? 'wrong-seat-reproduced' : 'explicit-request-isolated';
  } catch(error) {
    report.failure = String(error.stack || error);
    throw error;
  } finally {
    await browser.close();
    await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  }
  console.log(JSON.stringify({build,status:report.status}));
}

main().catch(error=>{console.error(error);process.exitCode=1;});
