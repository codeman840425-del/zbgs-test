// Delayed-motion peer admission and cleanup. Test-only routes/prototype disposal
// listeners; no product imports, source mutation or hidden loading placeholders.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {prepareOutput,verifyCandidate,writeFailure}=require('../qa-m1-common.cjs');
const build=process.env.QA_BUILD;
const plan={build:build||'REQUIRE_NEXT_FIXED_BUILD',primary:'male',peers:['female','male'],cases:['delay UAL motion .35s: no unready root enters rendered scene','release: visible peer, positive foot/pelvis calibration and posed arms','cancel while motion delayed: no root, resources disposed, primary unchanged','motion HTTP503: no partial root, resources disposed, primary unchanged','retry after cancel/failure succeeds'],limits:['CPU scene ownership and dispose events; not GPU-driver allocation accounting','Not gesture or arbitrary network failure coverage']};
async function timeout(p,ms=30000){let timer;try{return await Promise.race([p,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Intercepted motion request timeout')),ms);})]);}finally{clearTimeout(timer);}}
(async()=>{
 if(process.argv.includes('--plan')){console.log(JSON.stringify(plan,null,2));return;}
 const base=process.argv[2];if(!base||!/^http:\/\/127\.0\.0\.1:/.test(base)||!/^[a-f0-9]{12}$/.test(build||''))throw Error('Require fixed-check URL and explicit QA_BUILD');
 const {chromium}=require('../../prototype/node_modules/playwright');
 const out=await prepareOutput(build,'peer-ready-'+Date.now()),browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],report={plan,records:[],errors};
 const expect={build,assetId:'beta-base-male-m1b',sha256:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'};
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(new URL('?body=male',base).href);await page.waitForFunction(()=>__debug?.ready,null,{timeout:60000});report.initialGate=await verifyCandidate(page,expect);
  await page.evaluate(()=>{
   const d=__debug;d.setPaused(true);d.setDynamics(false);d.view('free');d.camera('room');
   const primary=d.avatar(),resources=new Set(),prototypes=new Map(),disposals=[];
   function watch(object,kind){if(!object)return;resources.add(object.uuid);let p=Object.getPrototypeOf(object);while(p&&!Object.hasOwn(p,'dispose'))p=Object.getPrototypeOf(p);if(!p||prototypes.has(p))return;const original=p.dispose;prototypes.set(p,original);p.dispose=function(...args){disposals.push({kind,uuid:this.uuid,primary:resources.has(this.uuid)});return original.apply(this,args);};}
   primary.root.traverse(o=>{if(o.geometry)watch(o.geometry,'geometry');for(const m of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){watch(m,'material');for(const value of Object.values(m))if(value?.isTexture)watch(value,'texture');}});
   const samplePrimary=()=>JSON.stringify({uuid:primary.root.uuid,position:primary.root.position.toArray(),quaternion:primary.root.quaternion.toArray(),outfit:primary.getOutfitInfo(),bones:Object.keys(primary.vrm.humanoid.normalizedHumanBones).map(n=>{const b=primary.vrm.humanoid.getNormalizedBoneNode(n);return[n,b.position.toArray(),b.quaternion.toArray()];}),face:primary.vrm.expressionManager.expressions.map(e=>[e.expressionName,e.weight])});
   const roots=()=>d.scene.children.filter(o=>o.name==='M1CompleteFoundation').map(o=>o.uuid);
   const baseline=samplePrimary(),baselineRoots=roots();let stopped=false;
   const frames=[];function frame(){if(stopped)return;frames.push({time:performance.now(),roots:roots()});requestAnimationFrame(frame);}requestAnimationFrame(frame);
   window.__peerQA={disposals,frames,baselineRoots,state:()=>({roots:roots(),primaryUnchanged:samplePrimary()===baseline,primaryAttached:primary.root.parent===d.scene,primaryDisposals:disposals.filter(e=>e.primary),comparison:!!d.comparison(),disposalCount:disposals.length}),restore:()=>{stopped=true;for(const[p,original]of prototypes)p.dispose=original;}};
  });
  for(const peerBody of ['female','male'])for(const outcome of ['success','cancel','failure']){
   let release,arrivedResolve;const arrived=new Promise(resolve=>{arrivedResolve=resolve;});
   const routePattern='**/assets/motion/UAL1_Standard.glb';
   await page.route(routePattern,async route=>{arrivedResolve();await new Promise(resolve=>{release=resolve;});if(outcome==='failure')await route.fulfill({status:503,body:'QA injected peer motion failure'});else await route.continue();});
   const before=await page.evaluate(()=>({...__peerQA.state(),frameStart:__peerQA.frames.length}));
   try{
    await page.evaluate(body=>{window.__peerLoadResult=null;window.__peerLoadPromise=__debug.loadComparison(body).then(()=>{window.__peerLoadResult={ok:true};}).catch(e=>{window.__peerLoadResult={ok:false,error:String(e)};});},peerBody);
    await timeout(arrived);await page.waitForTimeout(350);
    const held=await page.evaluate(()=>({...__peerQA.state(),frames:__peerQA.frames.slice()}));
    assert.deepEqual(held.roots,before.roots,'Unready peer entered rendered world');assert(held.primaryUnchanged&&held.primaryAttached);assert(held.frames.slice(before.frameStart).every(f=>JSON.stringify(f.roots)===JSON.stringify(before.roots)));
    await page.screenshot({path:path.join(out,`${peerBody}-${outcome}-motion-held.png`)});
    if(outcome==='cancel')await page.evaluate(()=>__debug.removeComparison());
    release();release=null;await page.waitForFunction(()=>window.__peerLoadResult!==null,null,{timeout:60000});
    const result=await page.evaluate(()=>window.__peerLoadResult);
    let loaded=null;
    if(outcome==='success'){
     assert(result.ok);
     loaded=await page.evaluate(()=>{const d=__debug,b=d.comparison(),a=b.avatar,V=a.root.position.constructor,arm=side=>{const upper=a.vrm.humanoid.getNormalizedBoneNode(side+'UpperArm'),hand=a.vrm.humanoid.getNormalizedBoneNode(side+'Hand');return{upper:upper.getWorldPosition(new V()).toArray(),hand:hand.getWorldPosition(new V()).toArray()};};return{state:__peerQA.state(),visible:a.root.visible,attached:a.root.parent===d.scene,calibration:b.motion.getFootLockCalibration(),pelvisSamples:b.motion.getMetrics().seatSurfaceSamples,arms:[arm('left'),arm('right')],profile:a.profile};});
     assert(loaded.visible&&loaded.attached&&loaded.pelvisSamples>0);assert.equal(loaded.calibration.length,2);
     assert(loaded.calibration.every(f=>f.selection?.selectedVertexCount>0&&f.selection.patches.heel.length>0&&f.selection.patches.toe.length>0),'Offscene calibration empty');
     assert(loaded.arms.every(a=>a.hand[1]<a.upper[1]-.05),'Peer still T-pose when admitted');
     await page.screenshot({path:path.join(out,`${peerBody}-ready.png`)});await page.evaluate(()=>__debug.removeComparison());
    }else{assert.equal(result.ok,false);assert.match(result.error,outcome==='cancel'?/cancelled/:/503|fetch|load/i);}
    const after=await page.evaluate(()=>__peerQA.state());assert.deepEqual(after.roots,before.roots);assert(after.primaryUnchanged&&after.primaryAttached&&!after.comparison);assert.equal(after.primaryDisposals.length,0);assert(after.disposalCount>before.disposalCount,'Peer resources were not disposed');
    report.records.push({peerBody,outcome,before,held:{...held,frames:held.frames.slice(before.frameStart)},result,loaded,after,passed:true});
   }finally{release?.();await page.unroute(routePattern);}
  }
  // A final success demonstrates both failure/cancel paths released load lock.
  const retry=await page.evaluate(async()=>{const b=await __debug.loadComparison('female'),calibration=b.motion.getFootLockCalibration();__debug.removeComparison();return{calibration,state:__peerQA.state()};});assert(!retry.state.comparison&&retry.state.primaryUnchanged);report.retry=retry;
  report.disposals=await page.evaluate(()=>__peerQA.disposals);report.finalGate=await verifyCandidate(page,expect);assert.equal(errors.length,0);report.passed=true;
 }catch(error){report.failure=String(error);await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});await writeFailure(out,error);throw error;}
 finally{await page.evaluate(()=>__peerQA?.restore()).catch(()=>{});await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(out);}
})().catch(error=>{console.error(error);process.exitCode=1;});
