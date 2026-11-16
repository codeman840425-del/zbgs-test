const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [url,build,outArg]=process.argv.slice(2),out=path.resolve(outArg);
const bodies={male:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff',female:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'};
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const report={build,status:'running',bodies:[],checks:[],errors:[],environment:{browser:browser.version(),viewport:[1440,900],scope:'Development PC; no ordinary-PC performance result'}};
 let context,page;
 try{
  for(const [body,sha256] of Object.entries(bodies)){
   const dir=path.join(out,body);await fs.mkdir(dir);
   context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir,size:{width:1440,height:900}}});
   page=await context.newPage();page.on('pageerror',e=>report.errors.push(String(e)));
   const requests=[];page.on('request',r=>{if(r.url().includes('m2-paired-ear-accessory-v1'))requests.push(r.url());});
   await page.goto(url+'/?body='+body+'&workbench=appearance');await page.waitForFunction(()=>__debug?.ready,null,{timeout:60000});
   const identity=await verifyCandidate(page,{build,sha256,assetId:body==='male'?'beta-base-male-m1b':'beta-base-female-m1'});
   assert.deepEqual(requests,[],'No accessory download when unselected');
   const state=()=>page.evaluate(()=>__debug.avatar().rigidAccessories.getState());
   assert.equal((await state()).selection,'none');
   await page.evaluate(()=>{__debug.setPlaybackRate(1);__debug.setPaused(false);__debug.camera('inspect-face-front');});
   const selections=[];
   for(const value of ['left','pair','right','none','pair']){
    const result=await page.evaluate(value=>__debug.command({type:'accessory',kind:'ears',value}),value);assert.equal(result.applied,true);
    const s=await state();assert.equal(s.selection,value);assert.equal(s.instances.length,value==='pair'?2:value==='none'?0:1);
    selections.push(s);await page.waitForTimeout(400);
   }
   const saved=await state();await fs.writeFile(path.join(dir,'ear-selection.json'),JSON.stringify(saved,null,2));
   await page.screenshot({path:path.join(dir,'front-pair.png')});
   assert.equal((await page.evaluate(()=>__debug.command({type:'accessory',kind:'glasses',value:true}))).applied,true);
   await page.evaluate(()=>{__debug.command({type:'speaking',value:true});__debug.command({type:'gaze',target:__debug.cameraObject().position.toArray()});});
   await page.waitForTimeout(2200);await page.screenshot({path:path.join(dir,'glasses-speaking.png')});
   await page.evaluate(()=>__debug.camera('inspect-face-side'));await page.waitForTimeout(600);await page.screenshot({path:path.join(dir,'side-pair.png')});
   await page.evaluate(()=>{
    window.__earSamples=[];window.__sampleEars=true;
    function sample(){if(!__sampleEars)return;const a=__debug.avatar(),h=a.vrm.humanoid.getRawBoneNode('head'),points=[];
     h.traverse(n=>{if(n.userData.rigidAccessoryId){const v=n.position.clone();n.getWorldPosition(v);h.worldToLocal(v);points.push({id:n.userData.rigidAccessoryId,actual:v.toArray(),expected:n.position.toArray()});}});
     __earSamples.push({t:performance.now(),points});requestAnimationFrame(sample);}
    requestAnimationFrame(sample);__debug.camera('room');__debug.setSpeed(1.05);__debug.walkTo(1,1.8);
   });
   const idle=()=>page.waitForFunction(()=>{const s=__debug.snapshot();return s.mode==='idle'&&!s.pending&&!s.target;},null,{timeout:45000});
   await idle();await page.evaluate(()=>{__debug.setSpeed(2.2);__debug.walkTo(-1,1.8);});await idle();
   await page.evaluate(()=>__debug.action('sit'));await page.waitForFunction(()=>__debug.snapshot().motion.sitProgress>.999,null,{timeout:45000});
   await page.waitForTimeout(600);await page.evaluate(()=>__debug.action('stand'));await idle();
   await page.evaluate(()=>{__sampleEars=false;__debug.command({type:'speaking',value:false});});
   const samples=await page.evaluate(()=>__earSamples);
   assert(samples.length>30);for(const s of samples){assert.equal(s.points.length,2);for(const p of s.points)assert(Math.hypot(...p.actual.map((x,i)=>x-p.expected[i]))<1e-5);}
   await fs.writeFile(path.join(dir,'head-local-samples.json'),JSON.stringify(samples,null,2));
   // Independent rigs must own separate meshes, transforms, materials and selection.
   await page.evaluate(body=>__debug.loadComparison(body==='male'?'female':'male').then(()=>true),body);
   const isolated=await page.evaluate(async()=>{
    const a=__debug.avatar(),b=__debug.comparison().avatar;
    await __debug.comparison().command({type:'accessory',kind:'ears',value:'pair'});
    const collect=x=>{const out=[];x.vrm.scene.traverse(n=>{if(n.userData.rigidAccessoryId)out.push(n);});return out;};
    const first=collect(a),second=collect(b),before=b.rigidAccessories.getState();
    const resourcesSeparate=first.every(x=>second.every(y=>x!==y&&x.geometry!==y.geometry&&x.material!==y.material));
    first[0].material.color.set('#ff0000');const materialIsolated=second.every(x=>x.material.color.getHexString()!=='ff0000');
    await __debug.command({type:'accessory',kind:'ears',value:'none'});
    const stateIsolated=JSON.stringify(before)===JSON.stringify(b.rigidAccessories.getState());
    __debug.removeComparison();await __debug.command({type:'accessory',kind:'ears',value:'pair'});
    return{resourcesSeparate,materialIsolated,stateIsolated,remainingPrimary:a.rigidAccessories.getState(),peerDisposed:b.rigidAccessories.getState()};
   });
   assert(isolated.resourcesSeparate&&isolated.materialIsolated&&isolated.stateIsolated);assert.equal(isolated.peerDisposed.disposed,true);
   await page.evaluate(()=>__debug.camera('inspect-face-front'));await page.screenshot({path:path.join(dir,'after-peer-disposal.png')});
   report.bodies.push({body,identity,selections,saved,isolated,requests,headSamples:samples.length});
   const video=page.video();await context.close();await video.saveAs(path.join(dir,'normal1x.webm'));context=null;
   // Fresh actor explicit side-record restoration. Native v6 is not extended.
   context=await browser.newContext({viewport:{width:1440,height:900}});page=await context.newPage();
   await page.goto(url+'/?body='+body+'&workbench=appearance');await page.waitForFunction(()=>__debug?.ready,null,{timeout:60000});
   const restored=await page.evaluate(s=>__debug.command({type:'accessory',kind:'ears',value:s.selection}),saved);assert.equal(restored.applied,true);
   const after=await state();for(const key of ['styleId','pairId','fitId','avatarSha256','assetSha256','selection'])assert.equal(after[key],saved[key]);
   await context.close();context=null;
  }
  assert.deepEqual(report.errors,[]);report.status='technical-checks-passed-visual-pending';
  report.checks=['Empty layer has no fetch dependency','Left/pair/right/none on exact original male and female',
   'Existing glasses, speaking, gaze, walk/run and sit/rise share original controller',
   'Raw-head-local attachment invariant through motion; not a full collision check',
   'Two actors separate geometry/material/selection and survive peer disposal','Saved independent side record restored in fresh context at same fixed build; native v6 unchanged'];
 }catch(e){report.status='failed';report.failure=String(e);report.stack=e.stack;process.exitCode=1;await page?.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}
 finally{await context?.close();await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify({status:report.status,failure:report.failure,out}));
})().catch(e=>{console.error(e);process.exitCode=1;});
