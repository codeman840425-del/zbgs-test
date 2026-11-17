const fs=require('node:fs/promises');
const path=require('node:path');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const {chromium}=require('../../prototype/node_modules/playwright');
const {verifyCandidate}=require('../../scripts/qa-m1-common.cjs');
const root=path.resolve(__dirname,'../..');
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
(async()=>{
  const request=JSON.parse(await fs.readFile(path.join(__dirname,'request.json')));
  const out=path.join(__dirname,'close-1');await fs.mkdir(out,{recursive:false});
  const model=await fs.readFile(path.join(root,request.model.path));assert.equal(hash(model),request.model.sha256);
  const loader=await fs.readFile(path.join(__dirname,'run-1/loader.mjs'));
  const previous=JSON.parse(await fs.readFile(path.join(__dirname,'run-1/report.json')));assert.equal(hash(loader),previous.loaderSha256);
  const report={schema:'native-vroid-room-close-view-v1',status:'running',build:request.build,model:request.model,loaderSha256:hash(loader),scriptSha256:hash(await fs.readFile(__filename)),captures:[],errors:[],scope:'Same room renderer/lights and saved shared-motion loader, static camera-only follow-up. No full factory admission.'};
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();
  page.on('pageerror',e=>report.errors.push(String(e)));
  try{
    await page.route('**/__native_vroid_qa__/loader.mjs',r=>r.fulfill({contentType:'text/javascript',body:loader}));
    await page.route('**/__native_vroid_qa__/model.vrm',r=>r.fulfill({contentType:'model/gltf-binary',body:model}));
    await page.goto(request.url+'?workbench=appearance&body=female');
    await page.waitForFunction(()=>__debug?.ready,null,{timeout:60000});
    report.room=await verifyCandidate(page,{build:request.build,body:'female',assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'});
    await page.evaluate(()=>{__debug.setPaused(true);__debug.setPlaybackRate(1);});
    report.candidate=await page.evaluate(async request=>(await import('/__native_vroid_qa__/loader.mjs')).install({id:request.id,sha256:request.model.sha256,sourceFloorY:request.sourceFloorY}),request);
    await page.evaluate(()=>__debug.setPaused(false));await page.waitForTimeout(1200);await page.evaluate(()=>__debug.setPaused(true));
    for(const shot of [{id:'front-neutral',expression:null,view:'front'},{id:'side-neutral',expression:null,view:'side'},{id:'front-blink',expression:'blink',view:'front'},{id:'front-happy',expression:'happy',view:'front'},{id:'front-aa',expression:'aa',view:'front'},{id:'front-oh',expression:'oh',view:'front'}]){
      const result=await page.evaluate(({shot,id})=>{
        const api=__nativeVRoidStudy,d=__debug,group=d.scene.getObjectByName('NativeVRoidStudy:'+id);
        const head=group.getObjectByName(api.info.normalizedBones.head.rawName);if(!head)throw Error('Raw head absent');
        const expression=api.expression(shot.expression??'neutral');group.updateMatrixWorld(true);
        const target=head.getWorldPosition(group.position.clone());target.y+=.025;
        const offset=target.clone().set(shot.view==='side'?.70:0,.015,shot.view==='side'?0:.70).applyQuaternion(group.quaternion);
        const camera=d.cameraObject();camera.position.copy(target).add(offset);camera.up.set(0,1,0);camera.lookAt(target);camera.updateMatrixWorld(true);
        d.renderer.render(d.scene,camera);
        return {png:d.renderer.domElement.toDataURL('image/png'),camera:{position:camera.position.toArray(),target:target.toArray(),fov:camera.fov,aspect:camera.aspect},expression,snapshot:api.snapshot()};
      },{shot,id:request.id});
      await fs.writeFile(path.join(out,shot.id+'.png'),Buffer.from(result.png.split(',')[1],'base64'));delete result.png;report.captures.push({...shot,...result});
    }
    assert.deepEqual(report.errors,[]);report.status='static-close-views-captured-awaiting-human-review';
  }catch(e){report.status='failed';report.error=String(e.stack??e);process.exitCode=1;}
  finally{try{await page.evaluate(()=>__nativeVRoidStudy?.dispose());}catch{}await context.close();await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify({status:report.status,error:report.error}));
})().catch(e=>{console.error(e);process.exitCode=1;});

