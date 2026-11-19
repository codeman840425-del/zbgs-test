// Drive the ordinary two-room page through its controls. The diagnostic close-up
// changes only the camera, after the uninterrupted room approach and hold.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {createHash} = require('node:crypto');
const {projectOutput, productionRoot} = require('./project-output.cjs');
const {launchQABrowser} = require('./qa-browser-workspace.cjs');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const ORIGINAL_ROOM='5c676cafa500ac5fc79d2461935fc323844e02fa0a1baa01c8025cd75d3e4012';
const LOW_ROOM='64802112dd64938d88ef6e8115c90096a90f591833467db55bd837e4ca11eebc';
const ORIGINAL_PAIR='d38cd555d8b125c606ef28775b08fa96b2834c40c082e7ee06478dc4035f6989';

function checkLowPins(bytes,records,pin,build) {
  assert.match(pin??'',/^[0-9a-f]{64}$/,'Supply the complete combined package digest');
  assert.equal(hash(bytes),pin,'Combined package differs');
  const meta=JSON.parse(bytes);
  assert.equal(hash(records),ORIGINAL_PAIR,'Expected the original signed pair file');
  assert.equal(meta.roomManifestSha256,LOW_ROOM);
  assert.equal(meta.roomProfile,'vocal-fit-v1');
  assert.equal(meta.gameRuntime.sourceDigest,'ddcf40a56d0ef69662f7d0798ca7e6210bd8cc20f6dc52a2cc034d40b20fe28f');
  assert.equal(meta.gameRuntime.buildId,build);
  assert.equal(meta.gameInventorySha256,'3d3e2b3885003d0585c1b7eb6ea40c7490001a647f227c2dcff9377aa26060b5');
}

async function checkedFile(origin,row) {
  assert(row && !row.path.startsWith('/') && !row.path.includes('..') && !/[:\\?#%]/.test(row.path));
  const response=await fetch(new URL('/'+row.path,origin),{redirect:'error'});
  assert(response.ok,row.path);
  const bytes=Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.length,row.bytes,row.path);assert.equal(hash(bytes),row.sha256,row.path);
  return bytes;
}

// Installs read-only observers on one ordinary room page. Resource verification runs
// outside the browser so it cannot warm the actor's lazy anchor cache.
function observeLowRoom({pointId,descriptors,pageNode}) {
  const c=__recordConsumer,T=c.three,room=facilityRoom,cs=room.session.scene;
  const floor=cs.root.getObjectByName(room.floorId), floorY=floor.getWorldPosition(new T.Vector3()).y;
  const rule=room.session.document.singingRooms.find(r=>r.regionId===room.roomId);
  const score=cs.root.getObjectByName(rule.roles.score),page=score.getObjectByName(pageNode);
  if(!page?.isMesh)throw Error('Missing installed score mesh');
  const cache=new WeakMap(),trace=[],issues=[];
  function setup(a){
    if(cache.has(a))return cache.get(a);
    const avatar=a.avatar,shoe=avatar.profile.motion.getFootwear();
    const patches=[],v=new T.Vector3();
    for(const {side,selection} of a.motion.getFootLockCalibration())for(const area of ['heel','toe']){
      const points=selection.patches[area].map(p=>{
        const mesh=shoe.meshes.find(m=>m.uuid===p.mesh);
        if(!mesh?.isSkinnedMesh||!mesh.geometry.index?.array.includes(p.vertex))throw Error('Sole patch outside shoe');
        let owner,attached=false;
        for(let n=mesh;n;n=n.parent){
          if(!n.visible)throw Error('Hidden selected shoe');
          owner??=n.userData.equipmentId;attached||=n===c.scene;
        }
        if(!attached||owner!==shoe.id||![mesh.material].flat().every(m=>m.visible))throw Error('Detached selected shoe');
        return {mesh,i:p.vertex};
      });
      if(!points.length)throw Error('Empty sole patch');
      patches.push({side,area,points});
    }
    const body=avatar.profile.sha256,desc=descriptors[body],mouths=[];
    avatar.vrm.scene.traverse(n=>{if(n.isSkinnedMesh&&[n.material].flat().some(m=>m.name===desc.faceMouth.material))mouths.push(n);});
    if(mouths.length!==1||desc.rimVertexIds.length!==32)throw Error('Actual lip mesh/rim unavailable');
    const data={shoe:shoe.id,shoeSha:shoe.entry.sha256,mouth:mouths[0],desc,
      soles:()=>patches.map(({side,area,points})=>{
        const min=Math.min(...points.map(({mesh,i})=>mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld).y));
        return {side,area,count:points.length,aboveFloorM:min-floorY};
      })};
    cache.set(a,data);return data;
  }
  function feet(a) {
    const p=setup(a);return {shoe:p.shoe,sha256:p.shoeSha,patches:p.soles()};
  }
  function phase(a){try{return a.controller.captureFacilityPose().phase;}catch{return 'transition';}}
  let frame,last=-Infinity;
  function sample(time){
    if(time-last>=140){
      last=time;
      try{trace.push({time,frame:c.renderer.info.render.frame,lease:c.seatLeases.forSeat(pointId),
        actors:[...c.actors].map(([id,a])=>({id,root:a.avatar.root.position.toArray(),phase:phase(a),
          supportReady:a.motion.getMetrics().standingSupportReady,feet:feet(a)}))});}
      catch(e){issues.push(String(e.message));return;}
    }
    frame=requestAnimationFrame(sample);
  }
  frame=requestAnimationFrame(sample);
  function physical(id,withPages){
    const a=c.actors.get(id),{mouth,desc}=setup(a),actor=a.avatar,h=actor.vrm.humanoid,v=new T.Vector3();
    const lips=new T.Vector3();
    for(const idx of desc.rimVertexIds)lips.add(mouth.getVertexPosition(idx,v));
    mouth.localToWorld(lips.divideScalar(desc.rimVertexIds.length));
    const eyes=h.getRawBoneNode('leftEye').getWorldPosition(new T.Vector3()).lerp(h.getRawBoneNode('rightEye').getWorldPosition(v),.5);
    const mic=cs.resolveUsePoint(pointId).pickupMesh;
    mic.geometry.computeBoundingBox();const center=mic.localToWorld(mic.geometry.boundingBox.getCenter(v));
    const ray=new T.Raycaster();
    function hit(start,end,meshes){
      const d=end.clone().sub(start);ray.near=.00001;ray.far=d.length()+.004;
      ray.set(start,d.normalize());return ray.intersectObjects(meshes,false)[0];
    }
    const pickup=hit(lips,center,[mic]),live=actor.livePresentation.getState();
    const result={frame:c.renderer.info.render.frame,clock:a.controller.behaviorTasks.diagnostics().simulationTime,body:actor.profile.sha256,
      root:actor.root.position.toArray(),record:a.recordSha256,floorY,feet:feet(a),supportReady:a.motion.getMetrics().standingSupportReady,
      lipCenter:lips.toArray(),lipVertexCount:desc.rimVertexIds.length,eye:eyes.toArray(),contact:a.controller.vocalContact(),
      pickupHit:pickup?.point.toArray(),pickupDistance:pickup?.distance,triangle:pickup?.faceIndex,
      configuredGaze:live.gaze,speaking:live.speaking,aa:actor.vrm.expressionManager.getValue('aa'),lease:c.seatLeases.forSeat(pointId)};
    if(!withPages)return result;
    const bounds=new T.Box3(),matrix=score.matrixWorld.clone().invert().multiply(page.matrixWorld);
    const pos=page.geometry.attributes.position;
    for(let i=0;i<pos.count;i++)bounds.expandByPoint(v.fromBufferAttribute(pos,i).applyMatrix4(matrix));
    const blockers=[];cs.root.traverseVisible(n=>{if(n.isMesh)blockers.push(n);});
    for(const other of c.actors.values())if(other!==a)other.avatar.root.traverseVisible(n=>{if(n.isMesh)blockers.push(n);});
    result.pages=[];
    for(const side of [0,1])for(const u of [.15,.5,.85])for(const y of [.15,.5,.85]){
      const x=T.MathUtils.lerp(bounds.min.x,bounds.max.x,(side+u)/2), height=T.MathUtils.lerp(bounds.min.y,bounds.max.y,y);
      const target=hit(score.localToWorld(new T.Vector3(x,height,bounds.max.z+.16)),score.localToWorld(new T.Vector3(x,height,bounds.min.z-.16)),[page]);
      const first=target&&hit(eyes,target.point,blockers);
      const delta=first&&target?first.point.distanceTo(target.point):null;
      result.pages.push({side:side?'right':'left',u,v:y,pageMesh:page.name,target:target?.point.toArray(),
        visible:first?.object===page && delta<=.004,first:first?.object.name??null,delta,
        gazeOffsetDegrees:target&&live.gaze?T.MathUtils.radToDeg(new T.Vector3(...live.gaze).sub(eyes).angleTo(target.point.clone().sub(eyes))):null});
    }
    return result;
  }
  return {physical,finish(){cancelAnimationFrame(frame);return {floorY,trace,issues,events:c.seatLeases.history()};}};
}

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

async function frameMicSide(page,pointId) {
  return page.evaluate(id=>{
    const {three,camera,actors}=__recordConsumer, {session,orbit,floorId}=facilityRoom;
    const point=session.scene.describeUsePoints({floorId}).find(p=>p.id===id);
    const bounds=new three.Box3();
    for (const position of [point.transform.position,point.approachPosition,point.exitPosition,
      ...[...actors.values()].map(actor=>actor.avatar.root.position.toArray())]) {
      const foot=new three.Vector3(...position);
      bounds.expandByPoint(foot);bounds.expandByPoint(foot.add(new three.Vector3(0,1.85,0)));
    }
    const center=bounds.getCenter(new three.Vector3()),size=bounds.getSize(new three.Vector3());
    const direction=new three.Vector3(1,.35,.25).normalize().applyAxisAngle(new three.Vector3(0,1,0),point.transform.yaw);
    const halfAngle=camera.fov*Math.PI/360;
    const distance=1.15*Math.max(size.y,Math.hypot(size.x,size.z)/camera.aspect)/(2*Math.tan(halfAngle))+.5*Math.hypot(size.x,size.z);
    camera.position.copy(center).addScaledVector(direction,distance);orbit.target.copy(center);orbit.update();
    return {position:camera.position.toArray(),target:orbit.target.toArray(),fov:camera.fov};
  },pointId);
}

async function run(base, build, recordsFile, destination, cameraMode='room', anchorMode='legacy-or-registered',mode='original',packagePin) {
  const out=await projectOutput(destination,await productionRoot());
  assert.match(build,/^[0-9a-f]{12}$/);
  assert(['room','mic-side'].includes(cameraMode));
  assert(['legacy-or-registered','require-anchors'].includes(anchorMode));
  assert(['original','low-fit'].includes(mode));
  const low=mode==='low-fit';
  if(low)assert(cameraMode==='room' && anchorMode==='require-anchors','Use room require-anchors for the complete low-fit protocol');
  const origin=new URL(base);
  assert(origin.protocol==='http:' && ['localhost','127.0.0.1','[::1]'].includes(origin.hostname));
  const recordBytes=await fs.readFile(recordsFile),records=JSON.parse(recordBytes);
  assert.equal(records.length,2);
  const inputRecords=Object.fromEntries(records.map(r=>[r.identity.id,r.integrity.recordSha256]));
  assert.equal(Object.keys(inputRecords).length,2);
  const male=records.find(r=>r.appearanceRecipe.base.bodyType==='source-male-cc0-texture-release-v1');
  const female=records.find(r=>r.appearanceRecipe.base.bodyType==='source-female-uniform-texture-v1');
  assert(male && female,'Expected the two measured body registrations');
  const performer=low?female:male,otherPerformer=low?male:female;
  const response=await fetch(new URL('/facility-package.json',origin));
  assert(response.ok);
  const packageBytes=Buffer.from(await response.arrayBuffer()),published=JSON.parse(packageBytes);
  let descriptors,pageNames;
  if(low){
    checkLowPins(packageBytes,recordBytes,packagePin,build);
    const files=new Map(published.files.map(row=>[row.path,row]));
    assert.equal(files.size,published.files.length);
    for(let i=0;i<published.files.length;i+=8)
      await Promise.all(published.files.slice(i,i+8).map(row=>checkedFile(origin,row)));
    const json=async file=>JSON.parse(await checkedFile(origin,files.get(file)));
    descriptors=Object.fromEntries(await Promise.all(records.map(async r=>{
      const body=r.appearanceRecipe.base.sha256,desc=await json('assets/performer-lip-anchors-v1/'+body+'.json');
      assert.equal(desc.bodySha256,body);return [body,desc];
    })));
    const library=await json('facility/library-catalog.json');
    pageNames=Object.fromEntries(await Promise.all(published.rooms.map(async entry=>{
      const {document:doc}=await json(entry.save);
      const rule=doc.singingRooms.find(r=>r.regionId===entry.roomId),obj=doc.nodes.find(n=>n.id===rule.roles.score);
      const def=library.resources.find(r=>r.id===obj.resource.id&&r.version===obj.resource.version);
      assert(def.musicStand.pageNode);return [entry.key,def.musicStand.pageNode];
    })));
  } else assert.equal(published.roomManifestSha256,ORIGINAL_ROOM);
  assert.equal(published.gameRuntime.buildId,build);
  const anchorDir='assets/performer-lip-anchors-v1/';
  const anchorUrl=record=>'/'+anchorDir+record.appearanceRecipe.base.sha256+'.json';
  const requireAnchors=anchorMode==='require-anchors';
  const expectedPins=new Map(published.files.filter(row=>row.path.startsWith(anchorDir)).map(row=>['/'+row.path,row.sha256]));
  if(requireAnchors)assert.deepEqual([...expectedPins.keys()].sort(),records.map(anchorUrl).sort());
  function checkAnchorSource(contact,record) {
    if(requireAnchors)assert.deepEqual(contact.lipAnchor,{source:'descriptor',method:'posed-rim-vertices',
      descriptorSha256:expectedPins.get(anchorUrl(record))});
  }
  assert.deepEqual(published.rooms.map(r=>r.key).sort(),['singing-rental','singing-studio']);
  await fs.mkdir(path.dirname(out),{recursive:true});
  await fs.mkdir(out);
  const report={status:'incomplete',build,sourceDigest:published.gameRuntime.sourceDigest,inputRecords,
    combinedSha256:createHash('sha256').update(packageBytes).digest('hex'),roomManifest:published.roomManifestSha256,
    viewport:{width:1440,height:900},cameraMode,mode,rooms:[],errors:[],failedSessions:[],
    ...(low?{verifiedFiles:published.files.length,limits:[
      'Score visibility samples nine eye rays per physical page against visible room and companion meshes. The performing avatar itself is excluded.',
      'Gaze target and mouth-expression samples describe the live presentation. Page visibility does not demonstrate directed reading, text comprehension, eye fixation or audio.',
      'Foot trace samples mounted calibrated heel/toe skinned vertices about every 140 ms against the structural floor height. It is not a continuous sole collision sweep.']}: {})};
  let session;
  try {
    if(!low){session=await launchQABrowser(out,{channel:'chrome'});report.browser=session.browser.version();}
    for (const [index,entry] of published.rooms.entries()) {
      if(cameraMode==='mic-side' && entry.key!=='singing-studio')continue;
      const id=performer.identity.id,peer=otherPerformer.identity.id;
      const row={room:entry.key,point:entry.primaryUsePointId,performer:id,peer,sessions:[]};
      report.rooms.push(row);
      let storage,saved;
      for (const passName of (cameraMode==='mic-side'?['first']:['first','cold'])) {
        const pass={name:passName};row.sessions.push(pass);
        if(low){session=await launchQABrowser(out,{channel:'chrome'});report.browser=session.browser.version();}
        let probe;
        const context=await session.browser.newContext({viewport:report.viewport,deviceScaleFactor:1,
          ...(storage?{storageState:storage}:{}),serviceWorkers:'block',recordVideo:{dir:out,size:report.viewport}});
        const page=await context.newPage(),video=page.video();
        pass.anchorRequests=[];
        page.on('request',req=>{
          const route=new URL(req.url()).pathname;
          if(route.startsWith('/'+anchorDir))pass.anchorRequests.push(route);
        });
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
          if(requireAnchors)assert.deepEqual(pass.anchorRequests,[]);
          if(cameraMode==='mic-side')pass.camera=await frameMicSide(page,row.point);
          await startFrameSample(page);
          if(low)probe=await page.evaluateHandle(observeLowRoom,{pointId:row.point,descriptors,pageNode:pageNames[entry.key]});
          if (passName==='first') {
            if(!low){
            const attempt=await useButton(page,peer,'#facility-sit');
            pass.shortPerformer=await terminal(page,attempt);
            assert.equal(pass.shortPerformer.state,'failed',JSON.stringify(pass.shortPerformer));
            assert.equal(pass.shortPerformer.reason,'vocal-performer-outside-pickup-window');
            pass.unsuitableContact=await page.evaluate(key=>__recordConsumer.actors.get(key).controller.vocalContact(),peer);
            assert.equal(pass.unsuitableContact?.requestId,attempt.requestId);
            checkContact(pass.unsuitableContact,false);
            checkAnchorSource(pass.unsuitableContact,otherPerformer);
            await page.waitForFunction(({peer,point})=>{
              const ctrl=__recordConsumer.actors.get(peer).controller;
              try{return !__recordConsumer.seatLeases.forSeat(point) && ctrl.captureFacilityPose().phase==='idle';}
              catch{return false;}
            },{peer,point:row.point},{timeout:45000});
            }
            const begin=await useButton(page,id,'#facility-sit');
            pass.begin=begin;
            const other=await useButton(page,peer,'#facility-sit');
            pass.peerRequest=other;
            assert.equal(other.admission,'rejected');
            assert.match(other.reason,/unavailable|occupied|busy/);
            pass.arrival=await terminal(page,begin);
            assert.equal(pass.arrival.state,'completed',JSON.stringify(pass.arrival));
          } else {
            await page.locator('#facility-restore').click();
            await page.waitForFunction(()=>/已恢复|失败|mismatch|invalid|unavailable/.test(document.querySelector('#room-status').textContent),null,{timeout:45000});
            assert.match(await page.locator('#room-status').textContent(),/已恢复/);
            assert.deepEqual(await page.evaluate(()=>__recordConsumer.captureFacilityState()),saved);
          }
          await page.locator('#facility-actor').selectOption(id);
          pass.hold=[];
          for(let i=0;i<5;i++){
            const held=await readContact(page,id);pass.hold.push(held);
            if(low)held.physical=await probe.evaluate((p,[id,score])=>p.physical(id,score),[id,i===2]);
            await page.waitForTimeout(260);
          }
          for(const sample of pass.hold) {
            assert.equal(sample.pose.phase,'vocal');assert.equal(sample.live,true);
            checkContact(sample.contact,true);
            checkAnchorSource(sample.contact,performer);
          }
          if(requireAnchors)assert.deepEqual(pass.anchorRequests,
            passName==='first'&&!low?[anchorUrl(otherPerformer),anchorUrl(performer)]:[anchorUrl(performer)]);
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
            if(low)pass.exitStart=(await readContact(page,id)).root;
            pass.exit=await completed(page,await useButton(page,id,'#facility-stand'));
            const left=await readContact(page,id);
            pass.left=left;
            assert.equal(left.pose.phase,'idle');assert.equal(left.live,false);
            assert.equal(await page.evaluate(point=>__recordConsumer.seatLeases.forSeat(point),row.point),null);
            if(low){
              assert(Math.hypot(left.root[0]-pass.exitStart[0],left.root[2]-pass.exitStart[2])>.05,'No actual female departure');
              pass.takeoverRequest=await useButton(page,peer,'#facility-sit');
              pass.takeover=await terminal(page,pass.takeoverRequest);
              assert.equal(pass.takeover.state,'completed',JSON.stringify(pass.takeover));
              pass.maleHold=[];
              for(let i=0;i<3;i++){
                pass.maleHold.push(await probe.evaluate((p,[id,score])=>p.physical(id,score),[peer,i===1]));
                await page.waitForTimeout(260);
              }
              pass.maleExit=await completed(page,await useButton(page,peer,'#facility-stand'));
              pass.maleLeft=await readContact(page,peer);
              assert.equal(pass.maleLeft.pose.phase,'idle');assert.equal(pass.maleLeft.live,false);
              assert.equal(await page.evaluate(point=>__recordConsumer.seatLeases.forSeat(point),row.point),null);
              assert.deepEqual(pass.anchorRequests,[anchorUrl(performer),anchorUrl(otherPerformer)]);
            }
          }
          if(low){
            for(const [actor,samples] of [[performer,pass.hold.map(h=>h.physical)],[otherPerformer,pass.maleHold??[]]]){
              for(const s of samples){
                checkPhysical(s,actor);checkAnchorSource(s.contact,actor);
              }
            }
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
          try{
            if(probe){pass.trajectory=await probe.evaluate(p=>p.finish()).catch(e=>({issues:[e.message]}));await probe.dispose();}
            await context.close();
            pass.video=name+'-1x.webm';
            await fs.rename(await video.path(),path.join(out,pass.video));
            if(low && !pass.failure)assert.deepEqual(pass.trajectory.issues,[]);
          }finally{if(low){await session.close();session=null;}}
        }
      }
    }
    assert.deepEqual(report.errors,[]);
    assert.deepEqual(report.failedSessions,[],report.failedSessions.join(', '));
    report.status='technical-checked-visual-review-required';
  } catch(error) {report.failure=String(error.stack??error);throw error;}
  finally {try{await session?.close();}finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}}
}
function checkPhysical(sample,record) {
  assert.equal(sample.record,record.integrity.recordSha256);assert.equal(sample.body,record.appearanceRecipe.base.sha256);
  assert.equal(sample.lease?.ownerId,record.identity.id);assert.equal(sample.lease?.state,'occupied');
  assert.equal(sample.speaking,true);assert.equal(sample.lipVertexCount,32);assert(Number.isInteger(sample.triangle));
  checkContact(sample.contact,true);
  const dist=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
  assert(dist(sample.lipCenter,sample.contact.mouthWorld)<.00001,'Same-frame lip mismatch');
  assert(dist(sample.eye,sample.contact.eyeWorld)<.00001,'Same-frame eye mismatch');
  assert(Math.abs(sample.pickupDistance-sample.contact.mouthDistance)<.00001,'Same-frame pickup hit mismatch');
  assert.equal(sample.feet.sha256,record.appearanceRecipe.equipment.resources.shoes.sha256);
  assert.deepEqual(sample.feet.patches.map(p=>p.side+p.area).sort(),['leftheel','lefttoe','rightheel','righttoe']);
  assert(sample.feet.patches.every(p=>p.count>0&&Number.isFinite(p.aboveFloorM)));
  if(sample.pages){
    assert.equal(sample.pages.length,18);
    assert(sample.pages.every(p=>p.visible),'Physical score sample occluded or missing: '+JSON.stringify(sample.pages.find(p=>!p.visible)));
  }
}
module.exports={checkLowPins,checkPhysical};
if(require.main===module)run(...process.argv.slice(2)).catch(e=>{console.error(e);process.exitCode=1;});
