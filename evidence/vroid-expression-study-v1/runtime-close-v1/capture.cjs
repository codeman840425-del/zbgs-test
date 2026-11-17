const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../..');
const {chromium}=require(path.join(root,'prototype/node_modules/playwright'));
const {verifyCandidate}=require(path.join(root,'scripts/qa-m1-common.cjs'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const sourceFolder='evidence/vroid-expression-study-v1/native-single-expression-v1/';
const cases=[{id:'baseline',file:'expression-study-baseline.vrm',sha256:'48b08e0548a4ce58298fa1f2cc18b02c79d65b7cb4b0f4a199dffc5019689c8d'},
  {id:'candidate',file:'expression-study-candidate.vrm',sha256:'b839ed1429213a6e4bc1d4db450b358cc2c03effb2da3e5ca405c554f10b113b'}];
(async()=>{
  const original=await fs.readFile(path.join(root,'evidence/native-vroid-room-78912-v1/run-1/loader.mjs'));
  assert.equal(hash(original),'7ff841d8bad5862265fc5145d0118deb02b8f3c90133f21f67c2734204b53b54');
  let loader=original.toString();
  const changes=[['expression: (name) => {','expression: (name, value = 1) => {\n        if (!Number.isFinite(value) || value < 0 || value > 1) throw RangeError("Expression weight outside 0..1");'],['manager.setValue(name, 1);','manager.setValue(name, value);']];
  for(const [before,after] of changes){assert.equal(loader.split(before).length,2);loader=loader.replace(before,after);}
  await fs.writeFile(path.join(__dirname,'loader.mjs'),loader);
  const report={schema:'native-vroid-expression-room-comparison-v1',status:'running',build:'83decd027116',scriptSha256:hash(await fs.readFile(__filename)),originalLoaderSha256:hash(original),loaderSha256:hash(loader),testOnlyAdapterChanges:changes,
    scope:'Fixed room renderer and lights, official expressionManager. Original actor hidden; candidate own shared motion loader. Simulation paused at deterministic initial pose, no factory/appearance admission.',cases:[],errors:[]};
  const browser=await chromium.launch({channel:'chrome',headless:true});let sharedCamera=null;
  try{for(const entry of cases){
    const out=path.join(__dirname,entry.id);await fs.mkdir(out,{recursive:false});
    const bytes=await fs.readFile(path.join(root,sourceFolder,entry.file));assert.equal(hash(bytes),entry.sha256);
    const item={...entry,path:sourceFolder+entry.file,bytes:bytes.length,captures:[],errors:[]};report.cases.push(item);
    const context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:out,size:{width:1440,height:1000}}});const page=await context.newPage();
    page.on('pageerror',e=>item.errors.push(String(e)));
    try{
      await page.route('**/__native_vroid_qa__/loader.mjs',r=>r.fulfill({contentType:'text/javascript',body:loader}));
      await page.route('**/__native_vroid_qa__/model.vrm',r=>r.fulfill({contentType:'model/gltf-binary',body:bytes}));
      await page.goto('http://127.0.0.1:4196/?workbench=appearance&body=female');await page.waitForFunction(()=>__debug?.ready,null,{timeout:60000});
      item.room=await verifyCandidate(page,{build:report.build,body:'female',assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'});
      await page.evaluate(()=>{__debug.setPaused(true);__debug.setPlaybackRate(1);});
      item.candidate=await page.evaluate(async entry=>(await import('/__native_vroid_qa__/loader.mjs')).install({id:entry.id,sha256:entry.sha256,sourceFloorY:null}),entry);
      item.camera=await page.evaluate(({id,shared})=>{
        const d=__debug,api=__nativeVRoidStudy,g=d.scene.getObjectByName('NativeVRoidStudy:'+id),head=g.getObjectByName(api.info.normalizedBones.head.rawName);
        g.updateMatrixWorld(true);const target=head.getWorldPosition(g.position.clone());target.y+=.035;
        const position=target.clone().add(target.clone().set(0,.01,.58).applyQuaternion(g.quaternion));
        const camera=d.cameraObject();const fixed=shared??{position:position.toArray(),target:target.toArray(),fov:camera.fov,aspect:camera.aspect};
        const original=d.renderer.render;
        d.renderer.render=function(scene,cam){camera.position.fromArray(fixed.position);camera.up.set(0,1,0);camera.lookAt(...fixed.target);camera.fov=fixed.fov;camera.aspect=fixed.aspect;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);return original.call(this,scene,camera);};
        window.__expressionRestoreRender=()=>{d.renderer.render=original;delete window.__expressionRestoreRender;};
        const note=document.createElement('div');note.id='expression-study-note';note.textContent='原生Joy单参数技术对照 '+id+' · 原作者100→65 · 未注册人物';Object.assign(note.style,{position:'fixed',top:'10px',left:'10px',background:'#fff5dc',padding:'8px',zIndex:99999});document.body.appendChild(note);
        d.renderer.render(d.scene,camera);return fixed;
      },{id:entry.id,shared:sharedCamera});
      if(sharedCamera)assert.deepEqual(item.camera,sharedCamera);else sharedCamera=item.camera;
      for(const shot of [{id:'neutral',name:'happy',weight:0},{id:'happy-1',name:'happy',weight:1},{id:'happy-065',name:'happy',weight:.65},{id:'blink',name:'blink',weight:1},{id:'aa',name:'aa',weight:1}]){
        const data=await page.evaluate(shot=>{const result=__nativeVRoidStudy.expression(shot.name,shot.weight);if(!result.supported)throw Error('Missing '+shot.name);__debug.renderer.render(__debug.scene,__debug.cameraObject());return {result,png:__debug.renderer.domElement.toDataURL('image/png')};},shot);
        await fs.writeFile(path.join(out,shot.id+'.png'),Buffer.from(data.png.split(',')[1],'base64'));item.captures.push({...shot,result:data.result});
      }
      // Wall-clock RAF progression at playback rate 1, simulation/pose held constant.
      item.transition=await page.evaluate(async()=>{
        const api=__nativeVRoidStudy,started=performance.now(),frames=[];
        await new Promise(resolve=>{function tick(now){const t=(now-started)/1000;const w=t<.5?0:t<1.5?t-.5:t<2?1:t<3?3-t:0;
          const actual=api.expression('happy',w);__debug.renderer.render(__debug.scene,__debug.cameraObject());frames.push({elapsedSeconds:t,requestedWeight:w,actualValue:actual.actualValue});if(t<3.5)requestAnimationFrame(tick);else resolve();}requestAnimationFrame(tick);});
        return {playbackRate:1,clock:'performance.now / requestAnimationFrame',durationSeconds:(performance.now()-started)/1000,frames};
      });
      await page.screenshot({path:path.join(out,'neutral-return-screen.png')});
      item.final=await page.evaluate(()=>__nativeVRoidStudy.snapshot());assert.equal(item.final.tickError,null);assert.deepEqual(item.errors,[]);item.status='captured-awaiting-visual-review';
    }finally{
      try{await page.evaluate(()=>{__expressionRestoreRender?.();__nativeVRoidStudy?.dispose();});}catch{}
      const video=page.video();await context.close();if(video){await video.saveAs(path.join(out,'normal1x.webm'));await video.delete();}
    }
  }report.status='same-camera-expression-comparison-captured';}
  catch(e){report.status='failed-or-incomplete';report.error=String(e.stack??e);process.exitCode=1;}
  finally{await browser.close();await fs.writeFile(path.join(__dirname,'report.json'),JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify({status:report.status,error:report.error,cases:report.cases.map(c=>({id:c.id,status:c.status,frames:c.transition?.frames.length}))}));
})().catch(e=>{console.error(e);process.exitCode=1;});
