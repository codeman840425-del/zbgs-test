// node scripts/qa-signed-live-equipment.cjs GAME_DIR INVENTORY_SHA256 SIGNED_RECORDS_JSON NEW_PROJECT_DIR
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const {productionRoot,projectOutput}=require('./project-output.cjs');
const {launchQABrowser}=require('./qa-browser-workspace.cjs');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const kinds=['mic','glasses'];

async function readPair(folder,pin,signedFile) {
  const {checkedBytes}=await import('./runtime-package/files.mjs');
  const dir=await fs.realpath(folder),bytes=await fs.readFile(path.join(dir,'runtime-package.json'));
  assert.equal(sha(bytes),pin,'Unexpected inventory SHA-256');
  const inventory=JSON.parse(bytes),files=new Map(inventory.files.map(f=>['/'+f.path,f]));
  const read=file=>checkedBytes(dir,files.get('/'+file));
  const records=await Promise.all(inventory.records.map(row=>read(row.file).then(JSON.parse)));
  const signed=await fs.readFile(signedFile);
  assert.deepEqual(records,JSON.parse(signed),'Package must contain the supplied signed records, in order');
  assert.equal(records.length,2);assert.notEqual(records[0].identity.id,records[1].identity.id);
  assert.notEqual(records[0].appearanceRecipe.base.sha256,records[1].appearanceRecipe.base.sha256);
  const owner=records.find(record=>record.liveAccessories.selections.mic.enabled);
  assert.equal(records.filter(record=>record.liveAccessories.selections.mic.enabled).length,1,'Expected one selected microphone');
  assert(records.every(record=>record.liveAccessories.selections.glasses.enabled),'Both records must wear glasses');
  const catalog=JSON.parse(await read('assets/m1c/accessories.json'));
  const resources={};
  for(const [kind,id] of Object.entries({mic:'studio-microphone-v1',glasses:'studio-glasses-v1'})) {
    const item=catalog.items.find(item=>item.id===id);assert.ok(item,id);
    const row=files.get(item.url);assert.equal(row.sha256,item.sha256);assert.equal(row.bytes,item.bytes);
    resources[kind]=item;
    for(const record of records) {
      const slot=record.liveAccessories.selections[kind];
      if(!slot.enabled){assert.equal(slot.identity,null);continue;}
      assert.equal(slot.identity.bodySHA256,record.appearanceRecipe.base.sha256);
      assert.equal(slot.identity.accessorySHA256,item.sha256);
      assert.equal(slot.identity.fit.bodySHA256,slot.identity.bodySHA256);
      assert.equal(slot.identity.fit.accessorySHA256,item.sha256);
    }
  }
  const gripId=owner.liveAccessories.selections.mic.identity.fit;
  const gripRow=inventory.files.find(row=>row.sha256===gripId.sha256);assert.ok(gripRow,'Missing signed grip input');
  const grip=JSON.parse(await read(gripRow.path));assert.equal(grip.id,gripId.id);
  assert.equal(grip.compatibleAvatarSha256,owner.appearanceRecipe.base.sha256);
  assert.equal(grip.compatibleAccessorySha256,resources.mic.sha256);
  return {inventory,files,dir,records,resources,grip,micOwner:owner.identity.id,signedSha256:sha(signed)};
}

// In the released game, observe only normal camera draws. The props are
// parented to each actor's presentation mount and follow raw bones in world space.
async function observe({records,resources,grip}) {
  const c=window.__recordConsumer,rows=[],reset=[],samplers=[];
  try {
    for(const record of records) {
      const actor=c.actors.get(record.identity.id),{avatar}=actor;
      const live=avatar.livePresentation.getState(),root=avatar.root;
      const mount=root.children.find(n=>n.name.startsWith('LivePresentation:'));
      if(!mount||root.parent!==c.scene)throw Error('Actor or presentation mount is detached: '+record.identity.id);
      const row={id:actor.identity.id,recordSha256:actor.recordSha256,revision:actor.revision,
        root:root.uuid,bodySHA256:live.avatarSha256,slots:{},captured:(await actor.capture()).liveAccessories};
      rows.push(row);
      for(const kind of ['mic','glasses']) {
        const state=live.accessories[kind],objects=mount.children.filter(n=>n.name==='LiveAccessory:'+kind);
        const slot=row.slots[kind]={status:state.status,loaded:state.loaded,identity:state.identity,
          sha256:state.sha256,count:objects.length,object:objects[0]?.uuid??null,meshes:[]};
        if(!objects.length)continue;
        const prop=objects[0],humanoid=avatar.vrm.humanoid;
        const raw=name=>humanoid.getRawBoneNode(name),bone=raw(kind==='mic'?'rightHand':'head');
        const vector=array=>root.position.clone().fromArray(array);
        const world=node=>node.getWorldPosition(root.position.clone());
        const orientation=node=>node.getWorldQuaternion(root.quaternion.clone());
        const anchor=resources[kind].sockets[kind==='mic'?'grip':'bridge'].position;
        let initialLocal,initialQ;
        Object.assign(slot,{catalogId:resources[kind].id,bone:bone.name,boneUuid:bone.uuid,
          geometryFit:kind==='glasses'?prop.userData.templeFit:live.fit.gripProfile,
          fitMethod:kind==='glasses'?live.fit.eyeFitMethod:null,localDriftM:0,angularDriftRad:0});
        prop.traverse(mesh=>{
          if(!mesh.isMesh)return;
          const m={name:mesh.name,uuid:mesh.uuid,geometry:mesh.geometry.uuid,draws:0,
            vertices:mesh.geometry.attributes.position.count};slot.meshes.push(m);
          const prior=mesh.onAfterRender,own=Object.hasOwn(mesh,'onAfterRender');
          mesh.onAfterRender=function(renderer,scene,camera,...args) {
            prior.call(this,renderer,scene,camera,...args);
            if(renderer===c.renderer&&scene===c.scene&&camera.isPerspectiveCamera)m.draws++;
          };
          reset.push(()=>{if(own)mesh.onAfterRender=prior;else delete mesh.onAfterRender;});
        });
        samplers.push(()=>{
          const point=prop.localToWorld(vector(anchor)),local=bone.worldToLocal(point.clone());
          const q=orientation(bone).invert().multiply(orientation(prop));
          if(!initialLocal){initialLocal=local.clone();initialQ=q.clone();slot.boneLocal=local.toArray();}
          slot.localDriftM=Math.max(slot.localDriftM,initialLocal.distanceTo(local));
          slot.angularDriftRad=Math.max(slot.angularDriftRad,initialQ.angleTo(q));
          if(kind==='mic'){
            slot.gripErrorM=Math.max(slot.gripErrorM??0,local.distanceTo(vector(grip.micRawHandLocal.position)));
            const expected=root.quaternion.clone().fromArray(grip.micRawHandLocal.quaternion);
            slot.gripAngleErrorRad=Math.max(slot.gripAngleErrorRad??0,q.angleTo(expected));
            const tip=prop.localToWorld(vector(resources.mic.sockets.capsule.position));
            const mouth=raw('head').localToWorld(vector(record.liveAccessories.microphonePresentation.mouthRawHeadLocal));
            slot.capsuleToMouthM=tip.distanceTo(mouth);
            slot.axisTowardMouth=vector(resources.mic.sockets.capsule.axis).applyQuaternion(orientation(prop)).dot(mouth.sub(tip).normalize());
          }else{
            const left=world(raw('leftEye')),right=world(raw('rightEye'));
            slot.eyeSpacingM=left.distanceTo(right);slot.bridgeToEyeMidM=point.distanceTo(left.lerp(right,.5));
          }
        });
      }
    }
    const begin=performance.now();let frames=0;
    do{
      await new Promise(resolve=>requestAnimationFrame(resolve));
      for(const sample of samplers)sample();frames++;
    }while(performance.now()-begin<550||frames<3);
    return {frames,rows};
  }finally{for(const restore of reset)restore();}
}

function verify(probe,records,removed) {
  const boneIds=new Set(),meshIds=new Set();
  for(const [i,row] of probe.rows.entries()){
    const r=records[i],expected=structuredClone(r.liveAccessories);
    if(r.identity.id===removed){
      for(const kind of kinds)expected.selections[kind]={enabled:false,identity:null};
      expected.microphonePresentation=null;
    }
    assert.equal(row.recordSha256,r.integrity.recordSha256);assert.equal(row.revision,r.revision);
    assert.equal(row.bodySHA256,r.appearanceRecipe.base.sha256);assert.deepEqual(row.captured,expected);
    for(const kind of kinds) {
      const slot=row.slots[kind],target=expected.selections[kind];
      assert.equal(slot.loaded,target.enabled);assert.equal(slot.count,Number(target.enabled));
      assert.equal(slot.status,target.enabled?'on':'off');assert.deepEqual(slot.identity,target.identity);
      if(!target.enabled)continue;
      assert.equal(slot.sha256,target.identity.accessorySHA256);assert.equal(slot.geometryFit.id,target.identity.fit.id);
      assert.equal(slot.geometryFit.sha256,target.identity.fit.sha256);
      assert(!boneIds.has(slot.boneUuid));boneIds.add(slot.boneUuid);
      assert(slot.meshes.length>0 && slot.meshes.every(m=>m.vertices>0&&m.draws>0),'Expected each fitted mesh to draw');
      for(const mesh of slot.meshes){assert(!meshIds.has(mesh.uuid));meshIds.add(mesh.uuid);}
      assert(slot.localDriftM<.001 && slot.angularDriftRad<.002,'Attachment drifts relative to raw bone');
      if(kind==='mic')assert(slot.gripErrorM<.001 && slot.gripAngleErrorRad<.002,'Signed grip mount mismatch');
      else{
        assert.deepEqual(slot.geometryFit,target.identity.fit);
        assert(slot.bridgeToEyeMidM<2*slot.eyeSpacingM,'Glasses bridge far from both eyes');
        for(const name of target.identity.fit.changedMeshes)assert(slot.meshes.some(mesh=>mesh.name===name),'Missing fitted temple '+name);
      }
    }
  }
}

async function captureFilm() {
  const c=window.__recordConsumer,canvas=c.renderer.domElement;
  const type=['video/webm;codecs=vp9','video/webm;codecs=vp8'].find(t=>MediaRecorder.isTypeSupported(t));
  if(!type)throw Error('WebM screen recording unavailable');
  const stream=canvas.captureStream(30),parts=[],recorder=new MediaRecorder(stream,{mimeType:type,videoBitsPerSecond:4800000});
  const actors=[...c.actors.values()],clock=()=>actors.map(a=>a.avatar.livePresentation.getState().time);
  const camera=c.camera,previous=camera&&{position:camera.position.clone(),quaternion:camera.quaternion.clone()};
  const before=clock(),start=performance.now();
  try{
    if(camera?.isPerspectiveCamera){
      // Keep both heads, upper bodies and the microphone readable in the normal-speed film.
      const heads=actors.map(a=>a.avatar.vrm.humanoid.getRawBoneNode('head').getWorldPosition(a.avatar.root.position.clone()));
      const center=heads[0].clone().lerp(heads[1],.5);center.y-=.31;
      const tan=Math.tan(camera.fov*Math.PI/360);
      const distance=Math.max(.95/(2*tan),(heads[0].distanceTo(heads[1])+.85)/(2*tan*camera.aspect));
      const forward=camera.getWorldDirection(camera.position.clone());
      camera.position.copy(center).addScaledVector(forward,-distance);camera.lookAt(center);camera.updateMatrixWorld();
    }
    const done=new Promise((resolve,reject)=>{
      recorder.ondataavailable=e=>{if(e.data.size)parts.push(e.data);};
      recorder.onstop=resolve;recorder.onerror=e=>reject(Error(e.error?.message??'Video capture failed'));
    });
    recorder.start();await new Promise(resolve=>setTimeout(resolve,6500));recorder.stop();await done;
    const blob=new Blob(parts,{type});
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);
      reader.onerror=()=>reject(reader.error);reader.readAsDataURL(blob);});
    return {data:data.split(',')[1],type,framing:camera?.isPerspectiveCamera?'both upper bodies':'game camera',wallSeconds:(performance.now()-start)/1000,
      actorSeconds:clock().map((value,index)=>value-before[index]),width:canvas.width,height:canvas.height};
  }finally{
    if(previous){camera.position.copy(previous.position);camera.quaternion.copy(previous.quaternion);camera.updateMatrixWorld();}
    stream.getTracks().forEach(track=>track.stop());
  }
}

async function run(folder,pin,signedFile,destination) {
  const out=await projectOutput(destination,await productionRoot());
  const {checkedBytes}=await import('./runtime-package/files.mjs');
  const input=await readPair(folder,pin,signedFile),{inventory,records,micOwner}=input;
  await fs.mkdir(path.dirname(out),{recursive:true});await fs.mkdir(out);
  const report={status:'running',inventorySha256:pin,signedFileSha256:input.signedSha256,runtime:inventory.runtime,
    signed:inventory.records.map(({id,bodyType,avatarSha256,recordSha256})=>({id,bodyType,avatarSha256,recordSha256})),sessions:[],errors:[]};
  const probeInput={records,resources:input.resources,grip:input.grip},url='http://127.0.0.1:47123';
  const types={'.js':'text/javascript','.html':'text/html; charset=utf-8','.json':'application/json','.png':'image/png','.wasm':'application/wasm'};
  try{
    for(const phase of ['initial','cold-reopen']){
      const log={phase,stages:{},requests:[]};report.sessions.push(log);
      const session=await launchQABrowser(out,{channel:'chrome'});
      try{
        log.browser=session.browser.version();
        const context=await session.browser.newContext({viewport:{width:1440,height:920},deviceScaleFactor:1,serviceWorkers:'block'});
        await context.route(/^https?:/,async route=>{
          try{
            const req=new URL(route.request().url());assert.equal(req.origin,url);
            if(req.pathname==='/favicon.ico')return await route.fulfill({status:204});
            const row=input.files.get(req.pathname);assert.ok(row,req.pathname);const bytes=await checkedBytes(input.dir,row);
            log.requests.push(row.path);
            await route.fulfill({contentType:types[path.extname(row.path)]??'application/octet-stream',body:bytes});
          }catch(e){report.errors.push(String(e));await route.abort();}
        });
        const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
        await page.goto(url+'/record-consumer.html?records=/records/manifest.json');
        await page.waitForFunction(()=>window.__recordConsumer?.ready,null,{timeout:150000});
        assert.deepEqual(await page.evaluate(()=>({id:__recordConsumer.buildInfo.shortId,actors:[...__recordConsumer.actors.keys()],
          errors:__recordConsumer.errors})),{id:inventory.runtime.buildId,actors:records.map(r=>r.identity.id),errors:[]});
        async function sample(stage,removed){
          const observed=await page.evaluate(observe,probeInput);log.stages[stage]=observed;
          verify(observed,records,removed);return observed.rows;
        }
        const original=await sample('signed');
        await page.locator('#stage').screenshot({path:path.join(out,phase+'.png')});
        if(phase==='initial'){
          const peer=records.findIndex(r=>r.identity.id!==micOwner);
          for(const enabled of [false,true]){
            await page.evaluate(async({id,enabled})=>{
              const presentation=__recordConsumer.actors.get(id).avatar.livePresentation;
              for(const kind of ['mic','glasses']){
                const result=await presentation.setAccessory(kind,enabled);if(!result.applied)throw Error(result.reason??'Equip failed');
              }
            },{id:micOwner,enabled});
            const rows=await sample(enabled?'re-equipped':'removed',enabled?null:micOwner);
            assert.deepEqual(rows.map(row=>row.root),original.map(row=>row.root));
            assert.equal(rows[peer].slots.glasses.object,original[peer].slots.glasses.object);
            assert.deepEqual(rows[peer].slots.glasses.meshes.map(m=>m.uuid),original[peer].slots.glasses.meshes.map(m=>m.uuid));
          }
        }else{
          const previous=report.sessions[0].stages.signed.rows;
          assert(original.every((row,i)=>row.root!==previous[i].root),'Expected newly created actor instances');
          const {data,...film}=await page.evaluate(captureFilm);
          assert(film.actorSeconds.every(value=>value>0));
          const video=Buffer.from(data,'base64');assert(video.length>0);
          await fs.writeFile(path.join(out,'signed-pair-1x.webm'),video,{flag:'wx'});log.film={...film,bytes:video.length,sha256:sha(video)};
        }
        await context.close();
      }finally{await session.close();}
    }
    assert.deepEqual(report.errors,[]);report.status='passed';
  }catch(e){report.status='failed';report.failure=String(e.stack??e);throw e;}
  finally{await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});}
}
if(require.main===module)run(...process.argv.slice(2)).catch(e=>{console.error(e);process.exitCode=1;});
