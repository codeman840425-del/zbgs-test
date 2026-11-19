// Drive the ordinary two-room page through its controls. The diagnostic close-up
// changes only the camera, after the uninterrupted room approach and hold.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {projectOutput, productionRoot} = require('./project-output.cjs');
const {launchQABrowser} = require('./qa-browser-workspace.cjs');

async function useButton(page, actorId, selector) {
  await page.locator('#facility-actor').selectOption(actorId);
  const previous = await page.evaluate(id => __recordConsumer.actors.get(id).controller.behaviorTasks.history().length,actorId);
  await page.locator(selector).click();
  return page.evaluate(({id,previous}) => {
    const tasks=__recordConsumer.actors.get(id).controller.behaviorTasks;
    const issued=tasks.history().slice(previous).find(e=>['accepted','rejected','queued'].includes(e.type));
    if (!issued) throw Error('The facility button issued no task');
    return tasks.get(issued.task.requestId);
  },{id:actorId,previous});
}

async function terminal(page, task) {
  const payload={actor:task.ownerId, id:task.requestId};
  assert.equal(task.admission,'accepted',JSON.stringify(task));
  const handle=await page.waitForFunction(({actor,id})=>{
    const state=__recordConsumer.actors.get(actor).controller.behaviorTasks.get(id);
    return ['completed','cancelled','failed'].includes(state?.state)?state:null;
  },payload,{timeout:45000});
  const final=await handle.jsonValue();
  await handle.dispose();
  return final;
}

async function completed(page,task) {
  const final=await terminal(page,task);
  assert.equal(final.state,'completed',JSON.stringify(final));
  return final;
}

async function readContact(page,actorId) {
  return page.evaluate(id=>{
    const actor=__recordConsumer.actors.get(id),ctrl=actor.controller;
    return {record:actor.recordSha256,root:actor.avatar.root.position.toArray(),
      pose:ctrl.captureFacilityPose(),contact:ctrl.vocalContact(),
      live:actor.avatar.livePresentation.getState().speaking,
      simSeconds:ctrl.behaviorTasks.diagnostics().simulationTime,wallMs:performance.now()};
  },actorId);
}

// Independently compare the reported distance with the actual coordinates.
function checkContact(contact, expectedFit) {
  for (const key of ['mouthWorld','eyeWorld','pickupWorld'])
    assert(Array.isArray(contact?.[key]) && contact[key].length===3 && contact[key].every(Number.isFinite),key);
  const measured=Math.hypot(...contact.mouthWorld.map((value,index)=>value-contact.pickupWorld[index]));
  assert(Math.abs(measured-contact.mouthDistance)<.00001);
  assert([contact.incidenceDegrees,contact.facingDegrees].every(Number.isFinite));
  assert.equal(measured>=.06 && measured<=.26 && contact.incidenceDegrees<=35 && contact.facingDegrees<=45,expectedFit);
  assert.equal(contact.withinPickupWindow,expectedFit);
}

async function startFrameSample(page) {
  await page.evaluate(()=>{
    const start=performance.now(), intervals=[];
    let last=start, frame;
    function sample(time) {
      if(time>last)intervals.push(time-last);
      last=time;frame=requestAnimationFrame(sample);
    }
    frame=requestAnimationFrame(sample);
    window.finishFacilityFrameSample=()=>{
      cancelAnimationFrame(frame);
      intervals.sort((a,b)=>a-b);
      const at=p=>intervals[Math.max(0,Math.ceil(p*intervals.length)-1)]??null;
      return {wallMs:performance.now()-start,frames:intervals.length,p50Ms:at(.5),p95Ms:at(.95),
        maxMs:at(1),over50Ms:intervals.filter(ms=>ms>50).length};
    };
  });
}

async function run(base, build, recordsFile, destination) {
  const out=await projectOutput(destination,await productionRoot());
  assert.match(build,/^[0-9a-f]{12}$/);
  const origin=new URL(base);
  assert(origin.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(origin.hostname));
  const records=JSON.parse(await fs.readFile(recordsFile,'utf8'));
  assert.equal(records.length,2);
  const inputRecords=Object.fromEntries(records.map(r=>[r.identity.id,r.integrity.recordSha256]));
  assert.equal(Object.keys(inputRecords).length,2);
  const performer=records.find(r=>r.appearanceRecipe.base.bodyType==='source-male-cc0-texture-release-v1');
  const shortPerformer=records.find(r=>r.appearanceRecipe.base.bodyType==='source-female-uniform-texture-v1');
  assert(performer && shortPerformer,'Expected the two measured body registrations');
  const response=await fetch(new URL('/facility-package.json',origin));
  assert(response.ok);
  const packageBytes=Buffer.from(await response.arrayBuffer()),published=JSON.parse(packageBytes);
  assert.equal(published.roomManifestSha256,'5c676cafa500ac5fc79d2461935fc323844e02fa0a1baa01c8025cd75d3e4012');
  assert.equal(published.gameRuntime.buildId,build);
  assert.deepEqual(published.rooms.map(r=>r.key).sort(),['singing-rental','singing-studio']);
  await fs.mkdir(path.dirname(out),{recursive:true});
  await fs.mkdir(out);
  const report={status:'incomplete',build,sourceDigest:published.gameRuntime.sourceDigest,inputRecords,
    combinedSha256:createHash('sha256').update(packageBytes).digest('hex'),roomManifest:published.roomManifestSha256,
    viewport:{width:1440,height:900},rooms:[],errors:[],failedSessions:[]};
  let session;
  try {
    session=await launchQABrowser(out,{channel:'chrome'});
    report.browser=session.browser.version();
    for (const [index,entry] of published.rooms.entries()) {
      const id=performer.identity.id,peer=shortPerformer.identity.id;
      const row={room:entry.key,point:entry.primaryUsePointId,performer:id,peer,sessions:[]};
      report.rooms.push(row);
      let storage,saved;
      for (const passName of ['first','cold']) {
        const pass={name:passName};row.sessions.push(pass);
        const context=await session.browser.newContext({viewport:report.viewport,deviceScaleFactor:1,
          ...(storage?{storageState:storage}:{}),serviceWorkers:'block',recordVideo:{dir:out,size:report.viewport}});
        const page=await context.newPage(),video=page.video();
        page.on('pageerror',e=>report.errors.push(e.message));
        const name=entry.key+'-'+passName;
        try {
          const url=new URL('/facility-room.html',origin);
          if(index>0)url.searchParams.set('room',entry.key);
          await page.goto(url.href);
          await page.waitForFunction(()=>['ready','error'].includes(document.querySelector('#room-status')?.dataset.state),null,{timeout:90000});
          assert.equal(await page.locator('#room-status').getAttribute('data-state'),'ready',await page.locator('#room-status').textContent());
          assert.equal(await page.locator('#facility-seat').inputValue(),row.point);
          assert.match(await page.locator('#facility-sit').textContent(),/站唱/);
          assert.equal(await page.locator('#facility-rooms a').count(),2);
          pass.loaded=await page.evaluate(()=>({room:facilityRoom.roomKey,build:__recordConsumer.buildInfo.shortId,
            records:Object.fromEntries([...__recordConsumer.actors].map(([key,actor])=>[key,actor.recordSha256])),
            speaking:[...__recordConsumer.actors.values()].map(actor=>actor.avatar.livePresentation.getState().speaking)}));
          assert.deepEqual(pass.loaded,{room:entry.key,build,records:inputRecords,speaking:[false,false]});
          await startFrameSample(page);
          if (passName==='first') {
            const attempt=await useButton(page,peer,'#facility-sit');
            pass.shortPerformer=await terminal(page,attempt);
            assert.equal(pass.shortPerformer.state,'failed',JSON.stringify(pass.shortPerformer));
            assert.equal(pass.shortPerformer.reason,'vocal-performer-outside-pickup-window');
            pass.unsuitableContact=await page.evaluate(key=>__recordConsumer.actors.get(key).controller.vocalContact(),peer);
            assert.equal(pass.unsuitableContact?.requestId,attempt.requestId);
            checkContact(pass.unsuitableContact,false);
            await page.waitForFunction(({peer,point})=>{
              const ctrl=__recordConsumer.actors.get(peer).controller;
              try{return !__recordConsumer.seatLeases.forSeat(point) && ctrl.captureFacilityPose().phase==='idle';}
              catch{return false;}
            },{peer,point:row.point},{timeout:45000});
            const begin=await useButton(page,id,'#facility-sit');
            pass.begin=begin;
            const other=await useButton(page,peer,'#facility-sit');
            pass.peerRequest=other;
            assert.equal(other.admission,'rejected');
            assert.match(other.reason,/unavailable|occupied|busy/);
            pass.arrival=await completed(page,begin);
            await page.locator('#facility-actor').selectOption(id);
          } else {
            await page.locator('#facility-restore').click();
            await page.waitForFunction(()=>/已恢复|失败|mismatch|invalid|unavailable/.test(document.querySelector('#room-status').textContent),null,{timeout:45000});
            assert.match(await page.locator('#room-status').textContent(),/已恢复/);
            assert.deepEqual(await page.evaluate(()=>__recordConsumer.captureFacilityState()),saved);
          }
          pass.hold=[];
          for(let i=0;i<5;i++){pass.hold.push(await readContact(page,id));await page.waitForTimeout(260);}
          for(const sample of pass.hold) {
            assert.equal(sample.pose.phase,'vocal');assert.equal(sample.live,true);
            checkContact(sample.contact,true);
          }
          pass.activeTimeRatio=(pass.hold.at(-1).simSeconds-pass.hold[0].simSeconds)*1000/(pass.hold.at(-1).wallMs-pass.hold[0].wallMs);
          assert.equal(await page.evaluate(id=>__recordConsumer.actors.get(id).avatar.livePresentation.getState().speaking,peer),false);
          await page.screenshot({path:path.join(out,name+'-room.png')});
          if (passName==='first') {
            await page.locator('#facility-save').click();
            assert.match(await page.locator('#room-status').textContent(),/已保存/);
            storage=await context.storageState();
            const entries=storage.origins.flatMap(s=>s.localStorage).filter(e=>e.name.startsWith('facility-room-state:'));
            assert.equal(entries.length,1);
            saved=JSON.parse(entries[0].value);
            assert.deepEqual(saved,await page.evaluate(()=>__recordConsumer.captureFacilityState()));
            pass.saved=saved;
          } else {
            await page.evaluate(actorId=>{
              const consumer=__recordConsumer,actor=consumer.actors.get(actorId),rig=actor.controller.vocalContact();
              const target=new consumer.three.Vector3(...rig.mouthWorld).lerp(new consumer.three.Vector3(...rig.pickupWorld),.4);
              const offset=new consumer.three.Vector3(1.0,.18,.45).applyAxisAngle(new consumer.three.Vector3(0,1,0),actor.avatar.root.rotation.y);
              consumer.camera.position.copy(target).add(offset);
              facilityRoom.orbit.target.copy(target);facilityRoom.orbit.update();
            },id);
            await page.waitForTimeout(1300);
            await page.screenshot({path:path.join(out,name+'-close.png')});
            await page.locator('#facility-frame').click();
            pass.exit=await completed(page,await useButton(page,id,'#facility-stand'));
            const left=await readContact(page,id);
            pass.left=left;
            assert.equal(left.pose.phase,'idle');assert.equal(left.live,false);
            assert.equal(await page.evaluate(point=>__recordConsumer.seatLeases.forSeat(point),row.point),null);
          }
          pass.frameTiming=await page.evaluate(()=>window.finishFacilityFrameSample());
          assert(pass.frameTiming.frames>0);
        } catch(error) {
          pass.failure=String(error.message);
          pass.atFailure=await page.evaluate(()=>[...(window.__recordConsumer?.actors??[])].map(([key,{avatar,controller}])=>({
            actor:key,position:avatar.root.position.toArray(),yaw:avatar.root.rotation.y,
            contact:controller.vocalContact(),events:controller.behaviorTasks.history().slice(-4),
          }))).catch(()=>null);
          await page.screenshot({path:path.join(out,name+'-failure.png')}).catch(()=>{});
          report.failedSessions.push(name);
          break;
        } finally {
          await context.close();
          pass.video=name+'-1x.webm';
          await fs.rename(await video.path(),path.join(out,pass.video));
        }
      }
    }
    assert.deepEqual(report.errors,[]);
    assert.deepEqual(report.failedSessions,[],report.failedSessions.join(', '));
    report.status='technical-checked-visual-review-required';
  } catch(error) {report.failure=String(error.stack??error);throw error;}
  finally {try{await session?.close();}finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}}
}
if(require.main===module)run(...process.argv.slice(2)).catch(e=>{console.error(e);process.exitCode=1;});
