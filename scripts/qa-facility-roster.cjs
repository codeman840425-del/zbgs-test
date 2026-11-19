// node scripts/qa-facility-roster.cjs LOOPBACK_ORIGIN FACILITY_PACKAGE_SHA256 NEW_PROJECT_DIR ROOM
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const {productionRoot,projectOutput}=require('./project-output.cjs');
const {launchQABrowser}=require('./qa-browser-workspace.cjs');

async function run(base,pin,destination,room='plant-home') {
  const out=await projectOutput(destination,await productionRoot()),origin=new URL(base);
  assert.equal(origin.protocol,'http:');assert.ok(['127.0.0.1','localhost','[::1]'].includes(origin.hostname));
  assert.match(pin,/^[a-f0-9]{64}$/);
  const sha=body=>createHash('sha256').update(body).digest('hex');
  async function pinned(file,hash) {
    const response=await fetch(new URL('/'+file,origin),{redirect:'error'});assert.ok(response.ok,file);
    const bytes=Buffer.from(await response.arrayBuffer());assert.equal(sha(bytes),hash,file);return bytes;
  }
  const manifest=JSON.parse(await pinned('facility-package.json',pin));
  assert.ok(manifest.rooms.some(entry=>entry.key===room));
  const host=manifest.files.find(row=>row.path==='facility/company-host.js');
  await pinned(host.path,host.sha256);
  await fs.mkdir(out);
  const report={room,packageSha256:pin,hostSha256:host.sha256,runtime:manifest.gameRuntime,stages:[],errors:[],passed:false};
  let session;
  try {
    session=await launchQABrowser(out,{channel:'chrome'});
    const page=await session.browser.newPage();
    page.on('pageerror',error=>report.errors.push(error.message));
    report.browser=session.browser.version();
    const url=new URL('/facility-room.html?records=/records/manifest.json',origin);url.searchParams.set('room',room);
    await page.goto(url.href);
    await page.waitForFunction(()=>document.querySelector('#room-status').dataset.state==='ready',null,{timeout:150000});
    assert.equal(await page.evaluate(()=>__recordConsumer.buildInfo.shortId),manifest.gameRuntime.buildId);
    const select=page.locator('#facility-actor');
    const [a,b]=await select.locator('option').evaluateAll(options=>options.map(option=>option.value));
    assert.ok(a&&b&&a!==b);
    async function check(stage,ids,selected) {
      const view=await page.evaluate(()=>{
        const c=__recordConsumer,s=document.querySelector('#facility-actor');
        return {actors:[...c.actors.keys()],options:[...s.options].map(option=>option.value),selected:s.value,
          disabled:['actor','seat','sit','stand','save','restore'].map(id=>document.querySelector('#facility-'+id).disabled),
          status:document.querySelector('#room-status').textContent};
      });
      report.stages.push({stage,...view});assert.deepEqual(view.actors,ids,stage);assert.deepEqual(view.options,ids,stage);
      assert.equal(view.selected,selected,stage);assert.ok(view.disabled.every(value=>value===(ids.length===0)),stage);
    }
    const click=id=>page.locator('#facility-'+id).click();
    const status=text=>page.waitForFunction(expected=>document.querySelector('#room-status').textContent===expected,text,{timeout:90000});
    await check('initial',[a,b],a);
    await select.selectOption(b);await click('save');await status('角色状态已保存');
    const survivor=await page.evaluate(id=>__recordConsumer.actors.get(id).avatar.root.uuid,b);
    assert.deepEqual(await page.evaluate(id=>[__recordConsumer.removeActor(id),__recordConsumer.removeActor(id)],a),[true,false]);
    await check('remove non-current twice',[b],b);
    await click('restore');await status('saved-room-or-roster-mismatch');
    assert.equal(await page.evaluate(id=>__recordConsumer.actors.get(id).avatar.root.uuid,b),survivor);
    await check('failed restore keeps survivor',[b],b);
    await page.screenshot({path:path.join(out,'survivor.png')});
    await click('save');await click('restore');await status('角色状态已恢复');
    assert.notEqual(await page.evaluate(id=>__recordConsumer.actors.get(id).avatar.root.uuid,b),survivor);
    await check('restore same ID new instance',[b],b);
    const active=await page.evaluate(id=>{
      const c=__recordConsumer,seat=document.querySelector('#facility-seat').value;
      const actor=c.actors.get(id);
      document.querySelector('#facility-sit').click();
      const owner=c.seatLeases.forSeat(seat)?.ownerId;
      const removed=c.removeActor(id);
      document.querySelector('#facility-stand').click(); // Same turn, before the deferred roster refresh.
      return {owner,removed,lease:c.seatLeases.forSeat(seat),detached:actor.avatar.root.parent===null};
    },b);
    assert.deepEqual(active,{owner:b,removed:true,lease:null,detached:true});
    await check('remove active owner then click stale button',[],'');
    await page.screenshot({path:path.join(out,'empty.png')});
    await page.evaluate(async()=>{
      const c=__recordConsumer,load=c.selectGroup(0);c.cancel();await load;await c.retry();
    });
    await check('cancel group and retry without failures',[],'');
    // Observe the first real mount to remove it while the second signed actor is still loading.
    const removedDuringLoad=await page.evaluate(async id=>{
      const c=__recordConsumer;
      let observed=null;
      const added=()=>queueMicrotask(()=>{
        if(observed||!c.actors.has(id))return;
        observed={phase:c.snapshot().phase,removed:c.removeActor(id)};
      });
      c.scene.addEventListener('childadded',added);
      try{await c.selectGroup(0);}finally{c.scene.removeEventListener('childadded',added);}
      return observed;
    },a);
    assert.deepEqual(removedDuringLoad,{phase:'running',removed:true});
    await check('remove during group load',[b],b);
    await page.evaluate(async()=>{const c=__recordConsumer;await c.selectGroup(1,[...c.records].reverse());});
    await check('switch group',[b,a],b);
    await select.selectOption(b);
    const survivorTaskCount=await page.evaluate(({a,b})=>{
      const c=__recordConsumer,actor=c.actors.get(a),before=actor.controller.behaviorTasks.history().length;
      c.removeActor(b);document.querySelector('#facility-sit').click();
      return [before,actor.controller.behaviorTasks.history().length];
    },{a,b});
    assert.equal(survivorTaskCount[0],survivorTaskCount[1]);
    await check('remove selected actor without redirecting old click',[a],a);
    assert.deepEqual(report.errors,[]);report.passed=true;
  } catch(error){report.failure=String(error.stack??error);throw error;}
  finally {
    try{await session?.close();}
    finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
  }
}
if(require.main===module)run(...process.argv.slice(2)).catch(error=>{console.error(error);process.exitCode=1;});
