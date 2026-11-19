const assert = require('node:assert/strict');
const {createHash} = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const {projectOutput,productionRoot} = require('./project-output.cjs');
const {launchQABrowser} = require('./qa-browser-workspace.cjs');
const {observeNetwork} = require('./qa-cold-assets.cjs');

function actors() {
  const game=window.__recordConsumer;
  return [...game.actors.values()].map(actor=>{
    const avatar=actor.avatar, outfit=avatar.getOutfitInfo();
    return {signature:actor.recordSha256, body:avatar.profile.sha256, root:avatar.root.uuid,
      head:avatar.vrm.humanoid.getRawBoneNode('head').uuid, attached:avatar.root.parent===game.scene,
      visible:Object.values(outfit.equipment.items).filter(item=>item.visible).map(item=>item.id).sort()};
  });
}
async function loaded(page, group) {
  const signatures=group.map(r=>r.integrity.recordSha256);
  await page.waitForFunction(ids=>{
    const game=window.__recordConsumer;
    return game?.snapshot()?.items.every(i=>i.status==='completed') && ids.length===game.actors.size &&
      [...game.actors.values()].every(actor=>ids.includes(actor.recordSha256));
  },signatures,{timeout:60000});
  const current=await page.evaluate(actors);
  for(const record of group){
    const actor=current.find(a=>a.signature===record.integrity.recordSha256);
    assert(actor.attached);
    assert.equal(actor.body,record.appearanceRecipe.base.sha256);
    assert.deepEqual(actor.visible,Object.values(record.appearanceRecipe.equipment.resources).map(i=>i.id).sort());
  }
  return current;
}
async function main() {
  const [base,manifestSha,recordsFile,mode,directory,browserConfig]=process.argv.slice(2);
  assert(['before','after'].includes(mode));
  const origin=new URL(base);assert.equal(origin.hostname,'127.0.0.1');
  const out=await projectOutput(directory,await productionRoot());
  const records=JSON.parse(await fs.readFile(recordsFile));
  assert.equal(records.length,3);
  const bytes=Buffer.from(await (await fetch(new URL('runtime-package.json',origin))).arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'),manifestSha);
  const pkg=JSON.parse(bytes);
  assert.deepEqual(pkg.records.map(r=>r.recordSha256),records.map(r=>r.integrity.recordSha256));
  const third=records[2], body='/'+pkg.files.find(f=>f.sha256===third.appearanceRecipe.base.sha256 && f.path.endsWith('.vrm')).path;
  const index='/character-data/'+third.appearanceRecipe.base.bodyType+'/index.json';
  const report={mode,manifestSha,build:pkg.runtime.sourceDigest,body,index,sessions:[]};
  await fs.mkdir(out);
  try {
    for(const fault of ['none','503']){
      const browser=await launchQABrowser(out,browserConfig?{browserConfig}:{channel:'chrome'});
      const row={fault,requests:[],errors:[],browser:browser.browser.version()};report.sessions.push(row);
      try{
        const context=await browser.browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:800}});
        const page=await context.newPage();
        await observeNetwork(context,page);
        let phase='initial';
        const url=new URL(body,origin).href;
        page.on('pageerror',e=>row.errors.push(e.message));
        page.on('request',r=>{const p=new URL(r.url()).pathname;if([body,index].includes(p))row.requests.push({phase,path:p});});
        if(fault==='503')await page.route(url,route=>route.fulfill({status:503,body:'QA unavailable'}));
        await page.goto(new URL(pkg.runtime.entryUrl,origin).href);
        await page.waitForFunction(()=>window.__recordConsumer?.ready,null,{timeout:120000});
        row.initialError=await page.evaluate(()=>__recordConsumer.inputFailure);
        if(mode==='before' && fault==='503'){
          assert.match(row.initialError,/503/);assert.deepEqual(await page.evaluate(actors),[]);continue;
        }
        assert.equal(row.initialError,null);
        row.first=await loaded(page,records.slice(0,2));
        assert.equal(row.requests.filter(r=>r.path===index).length,mode==='before'?1:0);
        assert.equal(row.requests.filter(r=>r.path===body).length,mode==='before'?1:0);
        if(fault==='503'){
          phase='failed-switch';
          row.failedSwitch=await page.evaluate(async()=>{
            try{return {result:await __recordConsumer.selectGroup(1)};}catch(e){return {error:e.message};}
          });
          row.message=await page.locator('#status').innerText();
          assert.match(JSON.stringify([row.failedSwitch,row.message]),/503/);
          assert.deepEqual(await page.evaluate(actors),row.first,'Failed selection replaced the mounted actors');
          await page.unroute(url);
        }
        phase='second-group';await page.locator('#second').click();
        row.second=await loaded(page,[third]);
        assert(row.requests.some(r=>r.phase===phase && r.path===body));
        phase='return';await page.locator('#first').click();
        row.returned=await loaded(page,records.slice(0,2));
        assert(row.returned.every(a=>row.first.every(b=>a.head!==b.head && a.root!==b.root)));
        assert.deepEqual(row.errors,[]);
      } finally {await browser.close();}
    }
    report.status='checked';
  } finally {await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx'});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
