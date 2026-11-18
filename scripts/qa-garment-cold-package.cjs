const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {observeNetwork} = require('./qa-cold-assets.cjs');
const {productionRoot, projectOutput} = require('./project-output.cjs');

// Run on the standalone exported game twice. The opposite tier is identified
// from the other signed records, including failed/redirected network attempts.
async function run(base, build, selectedFile, oppositeFile, directory) {
  const out = await projectOutput(directory, await productionRoot());
  const parse = async file => JSON.parse(await fs.readFile(file, 'utf8'));
  const [records, other] = await Promise.all([parse(selectedFile), parse(oppositeFile)]);
  assert.equal(records.length, 2);
  const top = record => {
    const equipment = record.appearanceRecipe.equipment;
    const matches = Object.values(equipment.resources).filter(item => item.slot === 'top');
    assert.equal(matches.length, 1);
    const item = matches[0];
    return {id:item.id, sha256:item.sha256, bytes:item.bytes,
      url:new URL(item.url, new URL(equipment.manifestUrl, base)).href};
  };
  const expected = records.map(top);
  const forbidden = other.map(top).map(item => item.url);
  assert.deepEqual(records.map(r=>r.identity.id), other.map(r=>r.identity.id));
  assert(expected.every(item => !forbidden.includes(item.url)));
  await fs.mkdir(out, {recursive:false});
  const {chromium} = require('../prototype/node_modules/playwright');
  const browser = await chromium.launch({channel:'chrome', headless:true});
  const report = {status:'incomplete', build, browser:browser.version(), runs:[]};
  try {
    for (const phase of ['first','reopened']) {
      const context = await browser.newContext({serviceWorkers:'block', viewport:{width:1440,height:900}});
      try {
        const page = await context.newPage(), requests = [], errors = [];
        page.on('request', request => requests.push(request.url()));
        page.on('pageerror', error => errors.push(error.message));
        const network = await observeNetwork(context, page);
        const trace = {phase, requests, errors};
        report.runs.push(trace);
        await page.goto(new URL('record-consumer.html?records=/records/manifest.json', base).href);
        await page.waitForFunction(()=>window.__recordConsumer?.ready, null, {timeout:120000});
        const state = await page.evaluate(async()=>{
          const api=window.__recordConsumer, actors=[];
          for (const a of api.actors.values()) {
            const record = await a.capture(), gear = Object.values(a.avatar.getEquipmentRecipe(a.controller.outfit));
            const top = gear.find(item=>item.slot==='top');
            const activeTop=a.avatar.getAssetProfile().meshRoles.top.map(uuid=>{
              const mesh=a.avatar.root.getObjectByProperty('uuid',uuid);
              let shown=true;
              for(let node=mesh;node;node=node.parent) shown=shown && node.visible;
              const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
              return {mesh:mesh.name, shown, textures:materials.map(m=>m.map?.image?.width || 0)};
            });
            actors.push({id:a.identity.id, sha:a.recordSha256, root:a.avatar.root.uuid,
              recipe:record.appearanceRecipe, topId:top?.id, activeTop});
          }
          return {build:api.buildInfo.shortId, failure:api.inputFailure, actors};
        });
        assert.equal(state.build, build);
        assert.equal(state.actors.length, 2, JSON.stringify(state.failure));
        assert.notEqual(state.actors[0].root, state.actors[1].root);
        trace.actors = [];
        for (const [index, record] of records.entries()) {
          const actor=state.actors.find(a=>a.id===record.identity.id), item=expected[index];
          assert(actor, record.identity.id);
          assert.deepEqual(actor.recipe, record.appearanceRecipe);
          assert.equal(actor.sha, record.integrity.recordSha256);
          assert.equal(actor.topId, item.id);
          assert(actor.activeTop.length && actor.activeTop.every(mesh=>mesh.shown), 'Selected top visibility');
          const expectedWidth=record.appearanceRecipe.equipment.role==='pants-top-far'?1024:2048;
          assert(actor.activeTop.some(mesh=>mesh.textures.includes(expectedWidth)), 'Rendered base-color texture size');
          const result = await network.read(item.url);
          const digest = createHash('sha256').update(result.bytes).digest('hex');
          assert.equal(digest, item.sha256);
          assert.equal(result.bytes.length, item.bytes);
          trace.actors.push({id:actor.id, root:actor.root, recordSha256:actor.sha, topId:item.id,
            url:new URL(item.url).pathname, sha256:digest, bodyBytes:result.bytes.length,
            transferBytes:result.transferBytes, activeTop:actor.activeTop});
        }
        await page.screenshot({path:path.join(out,phase+'.png')});
        trace.forbiddenRequests=requests.filter(url=>forbidden.includes(url));
        trace.network=network.diagnostics();
        assert.deepEqual(trace.forbiddenRequests, []);
        assert.deepEqual(trace.network.httpErrors, []);
        assert.deepEqual(trace.network.failed, []);
        assert.deepEqual(errors, []);
        assert(requests.every(url => !/^https?:/.test(url) || new URL(url).origin === new URL(base).origin));
      } finally { await context.close(); }
    }
    assert(report.runs[1].actors.every(a=>report.runs[0].actors.every(b=>a.root!==b.root)));
    report.status='passed';
  } catch(error) { report.failure=String(error.stack||error); throw error; }
  finally {
    await browser.close();
    await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  }
  console.log(JSON.stringify({status:report.status, build, output:out}));
}

run(...process.argv.slice(2)).catch(error=>{console.error(error);process.exitCode=1;});
