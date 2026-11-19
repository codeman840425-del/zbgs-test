// node check-room-restart.cjs FACILITY_GAME_DIR FACILITY_PACKAGE_SHA256 NEW_PROJECT_DIR [ROOM_KEY]
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const {setTimeout:delay} = require('node:timers/promises');
const {productionRoot, projectOutput} = require('../../scripts/project-output.cjs');
const {launchPersistentQABrowser} = require('../../scripts/qa-browser-workspace.cjs');
const {capturePair, saveColdVideo} = require('../../scripts/qa-production-cold-pair.cjs');

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const timeout = {timeout:90000};
const wantedTop = 'shared-male-studio-top-v1';
const viewport = {width:1280,height:840};
const json = bytes => JSON.parse(bytes.toString('utf8'));

async function packageInputs(folder, pin, roomKey) {
  const {checkedBytes} = await import('../../scripts/runtime-package/files.mjs');
  const root = await fs.realpath(folder);
  const bytes = await fs.readFile(path.join(root,'facility-package.json'));
  assert.match(pin,/^[a-f0-9]{64}$/);
  assert.equal(sha(bytes),pin,'Wrong facility package');
  const manifest=json(bytes);
  assert.equal(manifest.schema,'company-character-room-v1');
  const room=manifest.rooms.find(r=>r.key===roomKey);
  assert(room?.seatId,'Room has no registered chair');
  const rows=new Map(manifest.files.map(row=>[row.path,row]));
  assert.equal(rows.size,manifest.files.length,'Duplicate package file');
  const read=name=>checkedBytes(root,rows.get(name));
  const records=json(await fs.readFile(path.join(__dirname,'records.json')));
  assert.deepEqual(records.map(r=>r.identity.id),['studio-male-a','studio-male-b']);
  const list=json(await read('records/manifest.json'));
  assert.deepEqual(list.entries,records.map(r=>({id:r.identity.id,url:'/records/'+r.identity.id+'.json',recordSha256:r.integrity.recordSha256})));
  for(const r of records) {
    assert.deepEqual(json(await read('records/'+r.identity.id+'.json')),r);
    const tops=Object.values(r.appearanceRecipe.equipment.resources).filter(i=>i.slot==='top');
    assert.equal(tops.length,1);
    assert.equal(tops[0].id,wantedTop);
    assert.equal(tops[0].sha256,'7f1e8fafa3f22a73b1417dd7d2585949a560257f6a6643b9f135083c6e1522c2');
  }
  const [a,b]=records.map(r=>r.appearanceRecipe);
  assert.deepEqual(a.base,b.base);
  assert.deepEqual(a.equipment,b.equipment);
  assert.notDeepEqual(a.geometry,b.geometry);
  return {manifest,room,rows,read,records,root};
}

async function browserProcess(browser) {
  const cdp=await browser.newBrowserCDPSession();
  try {
    const {processInfo}=await cdp.send('SystemInfo.getProcessInfo');
    const ids=processInfo.filter(row=>row.type==='browser');
    assert.equal(ids.length,1,'Browser process not identified');
    assert(Number.isSafeInteger(ids[0].id) && ids[0].id>0);
    return ids[0].id;
  } finally {await cdp.detach();}
}

async function waitForExit(pid) {
  for(let i=0;i<120;i++){
    try{process.kill(pid,0);}
    catch(error){if(error.code==='ESRCH')return;throw error;}
    await delay(100);
  }
  throw Error('Previous browser process has not exited');
}

async function state(page,seat) {
  return page.evaluate(seat=>{
    const c=__recordConsumer;
    const people=[...c.actors.values()].map(actor=>{
      const hips=actor.avatar.vrm.humanoid.getRawBoneNode('hips');
      return {id:actor.identity.id,pose:actor.controller.captureFacilityPose(),root:actor.avatar.root.position.toArray(),
        hips:hips.getWorldPosition(hips.position.clone()).toArray(),sitProgress:actor.motion.getMetrics().sitProgress};
    });
    const point=facilityRoom.session.scene.describeUsePoint(seat);
    return {people,lease:c.seatLeases.forSeat(seat),seatWorld:point.transform.position,seatHeight:point.seatHeight,
      snapshot:c.captureFacilityState()};
  },seat);
}

function seated(snapshot,id) {
  const actor=snapshot.people.find(p=>p.id===id);
  assert.equal(actor.pose.phase,'seated');
  assert.equal(snapshot.lease?.ownerId,id);
  assert.equal(snapshot.lease?.state,'occupied');
  assert(actor.sitProgress>.98,'Seated animation did not settle');
  const [x,y,z]=snapshot.seatWorld;
  assert(Math.hypot(actor.hips[0]-x,actor.hips[2]-z)<.36,'Missed seat footprint');
  assert(Math.abs(actor.hips[1]-y-snapshot.seatHeight)<.36,'Missed seat height');
}

async function act(page,phase,id,kind,seat) {
  await page.locator('#facility-actor').selectOption(id);
  const trace=await page.evaluateHandle(id=>{
    const actor=__recordConsumer.actors.get(id);
    const sample=()=>actor.avatar.root.position.toArray();
    let first=sample(),previous=first,frames=0,movingFrames=0,distance=0,frame;
    function read(){
      const now=sample(),step=Math.hypot(now[0]-previous[0],now[2]-previous[2]);
      frames++;distance+=step;if(step>.0005)movingFrames++;
      previous=now;frame=requestAnimationFrame(read);
    }
    read();
    return {stop(){cancelAnimationFrame(frame);return {first,last:sample(),frames,movingFrames,distance};}};
  },id);
  try {
    const before=await page.evaluate(id=>__recordConsumer.actors.get(id).controller.behaviorTasks.history().at(-1)?.task?.requestId??null,id);
    await page.locator('#facility-'+kind).click();
    await page.waitForFunction(({id,kind,before})=>{
      const task=__recordConsumer.actors.get(id).controller.behaviorTasks.history().at(-1)?.task;
      return task && task.requestId!==before && task.kind===kind &&
        (task.admission==='rejected' || ['completed','failed','cancelled'].includes(task.state));
    },{id,kind,before},timeout);
    const task=await page.evaluate(id=>__recordConsumer.actors.get(id).controller.behaviorTasks.history().at(-1).task,id);
    const movement=await trace.evaluate(t=>t.stop());
    const observed=await state(page,seat);
    phase.actions.push({id,kind,task,movement,observed});
    assert.equal(task.state,'completed',JSON.stringify(task));
    assert.equal(task.admission,'accepted');
    assert.equal(task.ownerId,id);
    if(kind==='sit'){
      assert(movement.distance>.18 && movement.movingFrames>2,'No measured walking approach');
      seated(observed,id);
    } else {
      assert.equal(observed.people.find(p=>p.id===id).pose.phase,'idle');
      assert.equal(observed.lease,null);
    }
    return observed;
  } finally {await trace.dispose();}
}

async function run(folder,pin,destination,roomKey='plant-home') {
  const project=await productionRoot();
  assert(destination && !destination.split(/[\\/]/).includes('..'),'Expected a fresh in-project output');
  const absolute=path.resolve(project,destination),out=await projectOutput(absolute,project);
  assert.equal(out,absolute,'Output path was redirected');
  const {manifest,room,rows,read,records,root}=await packageInputs(folder,pin,roomKey);
  assert(out!==root && !out.startsWith(root+path.sep),'Output overlaps input');
  await fs.mkdir(out);
  const artifact=name=>projectOutput(path.join(out,name),out);
  const report={schema:'studio-facility-process-restore-v1',passed:false,facilityPackageSha256:pin,
    build:manifest.gameRuntime,room:room.key,seat:room.seatId,phases:[],errors:[]};
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.json':'application/json',
    '.png':'image/png','.jpg':'image/jpeg','.wasm':'application/wasm','.glb':'model/gltf-binary'};
  const server=http.createServer(async(req,res)=>{
    try{
      const name=new URL(req.url,'http://localhost').pathname.slice(1);
      if(name==='favicon.ico')return res.writeHead(204).end();
      if(!rows.has(name))return res.writeHead(404).end();
      const bytes=await read(name);
      res.writeHead(200,{'Content-Type':types[path.extname(name)]??'application/octet-stream','Content-Length':bytes.length}).end(bytes);
    }catch(error){report.errors.push(error.message);res.writeHead(500).end();}
  });
  let scratch,previousPid,saved,formerActors;
  try{
    scratch=await fs.mkdtemp(await artifact('.room-restart-'));
    const profile=await projectOutput(path.join(scratch,'profile'),scratch);
    const videoDir=await projectOutput(path.join(scratch,'recordings'),scratch);
    await fs.mkdir(videoDir);
    await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
    const origin='http://127.0.0.1:'+server.address().port;
    const url=new URL('/facility-room.html',origin);
    url.search=new URLSearchParams({room:room.key,records:'/records/manifest.json'});
    const key='facility-room-state:'+manifest.gameInventorySha256+':'+manifest.roomManifestSha256+':'+room.key;
    const [a,b]=records.map(r=>r.identity.id);
    for(const name of ['before-close','after-restart']){
      const phase={name,actions:[]};
      report.phases.push(phase);
      const session=await launchPersistentQABrowser(out,profile,{browserConfig:path.join(project,'scripts/production/fusion-cft145.json'),
        viewport,deviceScaleFactor:1,serviceWorkers:'block',recordVideo:{dir:videoDir,size:viewport}});
      let pid,page,video;
      try{
        report.browser=session.receipt;
        pid=await browserProcess(session.context.browser());
        if(previousPid)assert.notEqual(pid,previousPid,'Browser process reused');
        page=session.context.pages()[0]??await session.context.newPage();
        video=page.video();
        page.on('pageerror',e=>report.errors.push(e.message));
        page.on('response',r=>{if(r.status()>=400)report.errors.push(r.status()+' '+r.url());});
        await page.goto(url.href);
        await page.waitForFunction(()=>['ready','error'].includes(document.querySelector('#room-status')?.dataset.state),null,timeout);
        const status=page.locator('#room-status');
        assert.equal(await status.getAttribute('data-state'),'ready',await status.innerText());
        assert.equal(await page.evaluate(()=>location.origin),origin);
        assert.equal(await page.evaluate(()=>__recordConsumer.buildInfo.shortId),manifest.gameRuntime.buildId);
        assert.equal(await page.locator('#facility-seat').inputValue(),room.seatId);
        phase.initial=await capturePair(page,records,[]);
        assert.equal((await state(page,room.seatId)).lease,null);
        const readSave=()=>page.evaluate(k=>localStorage.getItem(k),key);
        if(name==='before-close'){
          assert.equal(await readSave(),null,'Initial profile is not clean');
          const sit=await act(page,phase,a,'sit',room.seatId);
          await page.locator('#facility-save').click();
          await page.waitForFunction(()=>document.querySelector('#room-status').textContent==='角色状态已保存',null,timeout);
          saved=await readSave();
          assert.deepEqual(JSON.parse(saved),sit.snapshot);
          phase.saved={key,sha256:sha(saved),state:JSON.parse(saved)};
          formerActors=phase.initial;
          await page.screenshot({path:await artifact('a-seated-before-close.png')});
        }else{
          const recovered=await readSave();
          assert.equal(recovered,saved,'Persistent browser did not retain the original save');
          phase.recoveredStorageSha256=sha(recovered);
          await page.locator('#facility-restore').click();
          await page.waitForFunction(()=>document.querySelector('#room-status').textContent==='角色状态已恢复',null,timeout);
          phase.restored=await state(page,room.seatId);
          seated(phase.restored,a);
          assert.deepEqual(phase.restored.snapshot,JSON.parse(saved));
          phase.restoredActors=await capturePair(page,records,[]);
          for(const [i,actor] of phase.restoredActors.entries()){
            assert.notEqual(actor.root,formerActors[i].root);
            assert.notEqual(actor.root,phase.initial[i].root);
          }
          await page.screenshot({path:await artifact('a-seated-after-restart.png')});
          await act(page,phase,a,'stand',room.seatId);
          await act(page,phase,b,'sit',room.seatId);
          await page.screenshot({path:await artifact('b-seated.png')});
          await act(page,phase,b,'stand',room.seatId);
        }
      }finally{
        try{
          if(page)await page.close();
          if(video)phase.video=await saveColdVideo(video,out,scratch,name+'-1x.webm');
        }finally{
          await session.close();
          if(pid){await waitForExit(pid);phase.browserProcessExited=true;previousPid=pid;}
        }
      }
    }
    assert.deepEqual(report.errors,[]);
    report.passed=true;
  }catch(error){report.failure=String(error.stack??error);throw error;}
  finally{
    try{
      if(server.listening)await new Promise(resolve=>server.close(resolve));
      if(scratch && await projectOutput(scratch,out)===scratch)await fs.rm(scratch,{recursive:true,force:true,maxRetries:3});
    }finally{await fs.writeFile(await artifact('report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
  }
  return report;
}

module.exports={run,packageInputs};
if(require.main===module)run(...process.argv.slice(2)).then(r=>console.log(JSON.stringify({passed:r.passed}))).catch(e=>{console.error(e);process.exitCode=1;});
