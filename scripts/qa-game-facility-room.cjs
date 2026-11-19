// Exercises the shipped room host, its retained furniture and signed actors.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {productionRoot, projectOutput} = require('./project-output.cjs');
const {launchQABrowser} = require('./qa-browser-workspace.cjs');

async function run(base, build, recordsFile, destination) {
  const out = await projectOutput(destination, await productionRoot());
  const origin = new URL(base);
  assert.equal(origin.protocol, 'http:');
  assert(['127.0.0.1','localhost','[::1]'].includes(origin.hostname));
  assert.match(build, /^[a-f0-9]{12}$/);
  const records = JSON.parse(await fs.readFile(recordsFile, 'utf8'));
  assert.equal(records.length, 2);
  assert.notEqual(records[0].appearanceRecipe.base.bodyType, records[1].appearanceRecipe.base.bodyType);
  await fs.mkdir(out);
  let session;
  const report = {build, passed:false, rooms:[], errors:[]};
  try {
    session = await launchQABrowser(out, {channel:'chrome'});
    report.browser = session.browser.version();
    for (const [index, room] of ['plant-home','plant-rental'].entries()) {
      const seat = room + '/ground/live/station-1/chair#seat';
      const first = records[index].identity.id, second = records[1-index].identity.id;
      const row = {room,seat,first,second,sessions:[]};
      report.rooms.push(row);
      let saved, savedStorage;
      for (const phase of ['first','reopened']) {
        const pass = {phase, observations:[]};
        row.sessions.push(pass);
        const viewport = {width:1280,height:880};
        const context = await session.browser.newContext({viewport,deviceScaleFactor:1,serviceWorkers:'block',
          ...(phase==='reopened'?{storageState:savedStorage}:{}),
          recordVideo:{dir:out,size:viewport}});
        const page = await context.newPage();
        const video = page.video();
        page.on('pageerror',error=>report.errors.push(error.message));
        async function task(id,kind,suffix) {
          const requestId = room+'/'+phase+'/'+suffix;
          const admission = await page.evaluate(({id,kind,seat,requestId})=>
            __recordConsumer.actors.get(id).controller.requestBehavior({kind,requestId,payload:{usePointId:seat}}),
          {id,kind,seat,requestId});
          pass.observations.push({id,kind,admission});
          return requestId;
        }
        async function result(id,requestId) {
          const arg = {id,requestId};
          await page.waitForFunction(({id,requestId})=>{
            const t=__recordConsumer.actors.get(id).controller.behaviorTasks.get(requestId);
            return t?.admission==='rejected'||['completed','failed','cancelled'].includes(t?.state);
          },arg,{timeout:45000});
          const value=await page.evaluate(({id,requestId})=>__recordConsumer.actors.get(id).controller.behaviorTasks.get(requestId),arg);
          pass.observations.push({result:value});
          return value;
        }
        const lease=()=>page.evaluate(id=>__recordConsumer.seatLeases.forSeat(id),seat);
        async function observePose(id) {
          return page.evaluate(({seat,id})=>{
            const consumer=__recordConsumer, actor=consumer.actors.get(id);
            const point=facilityRoom.session.scene.describeUsePoint(seat);
            const hips=actor.avatar.vrm.humanoid.getRawBoneNode('hips');
            return {point, pose:consumer.captureFacilityState().actors.find(a=>a.actorId===id).pose,
              hips:hips.getWorldPosition(hips.position.clone()).toArray(), root:actor.avatar.root.position.toArray(),
              owned:consumer.seatLeases.forSeat(seat),rendered:consumer.scene.getObjectById(actor.avatar.root.id)===actor.avatar.root};
          },{seat,id});
        }
        try {
          const url=new URL('/facility-room.html',origin);
          url.search=new URLSearchParams({room,records:'/records/manifest.json'});
          await page.goto(url.href);
          await page.waitForFunction(()=>document.querySelector('#room-status')?.dataset.state==='error'||
            (window.facilityRoom?.session && document.querySelector('#facility-controls')?.disabled===false),null,{timeout:90000});
          const initial=await page.evaluate(()=>({error:document.querySelector('#room-status')?.textContent,
            state:document.querySelector('#room-status')?.dataset.state,
            build:window.__recordConsumer?.buildInfo?.shortId,
            ids:[...(window.__recordConsumer?.actors?.values()??[])].map(a=>[a.identity.id,a.recordSha256])}));
          pass.initial=initial;
          assert.notEqual(initial.state,'error',initial.error);
          assert.equal(initial.build,build);
          assert.deepEqual(initial.ids.sort(),records.map(r=>[r.identity.id,r.integrity.recordSha256]).sort());
          assert.equal(await lease(),null);
          if (phase==='first') {
            const sit=await task(first,'sit','first-sit');
            const busy=await result(second,await task(second,'sit','contest'));
            assert(busy.admission==='rejected'||busy.state==='failed',JSON.stringify(busy));
            assert.match(busy.reason,/busy|occupied|reserved|unavailable/i);
            assert.equal((await result(first,sit)).state,'completed');
            saved=await page.evaluate(()=>__recordConsumer.captureFacilityState());
            await page.locator('#facility-save').click();
            savedStorage=await context.storageState();
            const entries=savedStorage.origins.flatMap(o=>o.localStorage).filter(e=>e.name.startsWith('facility-room-state:'));
            assert.equal(entries.length,1);
            assert.deepEqual(JSON.parse(entries[0].value),saved);
            pass.saved=saved;
          } else {
            await page.locator('#facility-restore').click();
            await page.waitForFunction(({id,seat})=>window.__recordConsumer?.seatLeases.forSeat(seat)?.state==='occupied' &&
              __recordConsumer.actors.get(id).controller.captureFacilityPose().phase==='seated',{id:first,seat},{timeout:45000});
            assert.deepEqual(await page.evaluate(()=>__recordConsumer.captureFacilityState()),saved);
          }
          const seated=await observePose(first);
          pass.seated=seated;
          assert.equal(seated.owned.state,'occupied');
          assert.equal(seated.owned.ownerId,first);
          assert.equal(seated.pose.phase,'seated');
          assert.equal(seated.point.id,seat);
          assert.equal(seated.rendered,true);
          const [cx,cy,cz]=seated.point.transform.position;
          const [hx,hy,hz]=seated.hips;
          assert(Math.hypot(hx-cx,hz-cz)<.36,'Hips missed actual seat footprint');
          assert(Math.abs(hy-cy-seated.point.seatHeight)<.36,'Hips missed actual seat height');
          await page.screenshot({path:path.join(out,room+'-'+phase+'-seated.png')});
          if (phase==='first') continue;
          assert.equal((await result(first,await task(first,'stand','leave'))).state,'completed');
          assert.equal(await lease(),null);
          const standing=await observePose(first);
          pass.standing=standing;
          assert(Math.hypot(standing.root[0]-cx,standing.root[2]-cz)>.30,'Seat was released with actor still at its center');
          const cancelled=await task(second,'sit','interrupted-approach');
          assert(await page.evaluate(({second,cancelled})=>__recordConsumer.actors.get(second).controller.cancelBehavior(cancelled),{second,cancelled}));
          assert.equal((await result(second,cancelled)).state,'cancelled');
          assert.equal(await lease(),null);
          assert.equal((await result(second,await task(second,'sit','second-sit'))).state,'completed');
          assert.equal((await lease()).ownerId,second);
          assert.equal((await result(second,await task(second,'stand','second-leave'))).state,'completed');
          assert.equal(await lease(),null);
          pass.history=await page.evaluate(()=>__recordConsumer.seatLeases.history());
        } finally {
          await context.close();
          const name=room+'-'+phase+'-1x.webm';
          await fs.rename(await video.path(),path.join(out,name));
          pass.video=name;
        }
      }
    }
    assert.deepEqual(report.errors,[]);
    report.passed=true;
  } catch (error) {
    report.failure=String(error.stack||error);
    throw error;
  } finally {
    try {await session?.close();}
    finally {await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
  }
}
if (require.main===module) run(...process.argv.slice(2)).catch(error=>{console.error(error);process.exitCode=1;});
