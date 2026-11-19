// Reproduce the archived room/actor combination which incorrectly passed packing.
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const assert = require('node:assert/strict');
const {productionRoot, projectOutput} = require('./project-output.cjs');
const {launchQABrowser} = require('./qa-browser-workspace.cjs');

async function run(base, destination) {
  const out = await projectOutput(destination, await productionRoot());
  const response = await fetch(new URL('facility-package.json', base));
  assert(response.ok);
  const pin = createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
  assert.equal(pin, 'a4b0705b4f9b26abec9aebef0aa0c862854d5d70ff169a1c97cbd48288583b13');
  await fs.mkdir(path.dirname(out), {recursive:true});
  await fs.mkdir(out);
  const report = {archivedPackage:pin, samples:[]};
  let session;
  try {
    session = await launchQABrowser(out, {channel:'chrome'});
    report.browser = session.browser.version();
    const page = await session.browser.newPage({viewport:{width:1440,height:900}});
    for (const room of ['singing-studio','singing-rental']) {
      const url = new URL('facility-room.html', base);
      url.searchParams.set('room',room);
      await page.goto(url.href);
      await page.waitForFunction(()=>document.querySelector('#room-status').dataset.state==='ready',null,{timeout:60000});
      const actor = 'uniform-lite-male-v1';
      await page.locator('#facility-actor').selectOption(actor);
      const point = await page.locator('#facility-seat').inputValue();
      assert(point.startsWith(room+'/'));
      await page.locator('#facility-sit').click();
      const result = await page.evaluate(id=>{
        const tasks = window.__recordConsumer.actors.get(id).controller.behaviorTasks;
        const event = tasks.history().findLast(e=>e.type==='rejected');
        return {build:window.__recordConsumer.buildInfo.shortId,task:event&&tasks.get(event.task.requestId),
          message:document.querySelector('#room-status').textContent};
      },actor);
      report.samples.push({room,actor,point,...result});
      assert.equal(result.build,'be0e52c243ec');
      assert.equal(result.task?.admission,'rejected');
      assert.equal(result.task.reason,'unsupported-facility-behavior');
      await page.screenshot({path:path.join(out,room+'.png')});
    }
    report.reproduced = true;
  } catch(error) {report.error = String(error.stack??error); throw error;}
  finally {
    try {await session?.close();} finally {await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
  }
}
if (require.main===module) run(...process.argv.slice(2)).catch(error=>{console.error(error);process.exitCode=1;});
