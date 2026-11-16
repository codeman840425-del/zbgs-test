// Affected clothing/chair integration, normal-time video and bounded solver timing.
// Point/vertex samples are diagnostics, not continuous triangle collision approval.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [url,build,destination]=process.argv.slice(2),out=path.resolve(destination);
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true}),ctx=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:out,size:{width:1440,height:900}}}),p=await ctx.newPage();
 const report={build,status:'running',checks:[],errors:[],scope:'Original female + exact selected ponytail, unchanged pants/skirt, original and moved/rotated chair. Development machine only. Normal time, no imposed FPS cap. Samples do not prove full collision freedom.'};
 p.on('pageerror',e=>report.errors.push(String(e)));
 const snap=async name=>p.screenshot({path:path.join(out,name+'.png')});
 const phase=async name=>p.evaluate(name=>{window.__contactPhase=name;},name);
 const task=async(id,kind,payload={})=>{
  const admission=await p.evaluate(({id,kind,payload})=>__debug.request({requestId:id,kind,payload}),{id,kind,payload});
  await p.waitForFunction(id=>['completed','failed','cancelled'].includes(__debug.tasks().get(id)?.state),id,{timeout:60000});
  const result=await p.evaluate(id=>__debug.tasks().get(id),id);assert.equal(result.state,'completed',JSON.stringify(result));
  report.checks.push({name:id,passed:true,admission,result});
 };
 try{
  await p.goto(url+'?body=female&workbench=appearance');await p.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});
  report.identity=await verifyCandidate(p,{build,assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'});
  assert((await p.evaluate(()=>__debug.command({type:'appearance',hairStyle:'female-ponytail-v1',hairColor:'brown'}))).applied);
  report.hair=await p.evaluate(()=>__debug.avatar().appearance.getState());
  await p.evaluate(()=>{
   __debug.setPlaybackRate(1);__debug.camera('inspect-half-side');
   window.__contactPhase='idle';window.__contactSamples=[];window.__solverTimes=[];window.__frameIntervals=[];
   const appearance=__debug.avatar().appearance,original=appearance.updateDynamics;
   window.__restoreHairTimer=()=>{appearance.updateDynamics=original;};
   appearance.updateDynamics=function(...args){const start=performance.now();try{return original.apply(this,args);}finally{__solverTimes.push({phase:__contactPhase,ms:performance.now()-start,dt:args[0]});}};
   window.__readHairContacts=()=>{
    const a=__debug.avatar(),colliders=__debug.chairColliders(),samples=[];
    a.vrm.scene.updateWorldMatrix(true,true);
    a.vrm.scene.traverse(mesh=>{
     if(!mesh.isSkinnedMesh||mesh.userData.assetRole!=='hair')return;
     for(let n=mesh;n;n=n.parent)if(!n.visible)return;
     mesh.skeleton.update();const vertices=mesh.geometry.attributes.position.count;
     for(const box of colliders){let inside=0,maxDepth=0;const v=mesh.position.clone(),local=v.clone();
      for(let i=0;i<vertices;i++){
       mesh.getVertexPosition(i,v);mesh.localToWorld(v);local.copy(v).applyMatrix4(box.inverseMatrixWorld);
       const lo=box.localBox.min,hi=box.localBox.max;
       if(local.x>lo.x&&local.x<hi.x&&local.y>lo.y&&local.y<hi.y&&local.z>lo.z&&local.z<hi.z){inside++;maxDepth=Math.max(maxDepth,Math.min(local.x-lo.x,hi.x-local.x,local.y-lo.y,hi.y-local.y,local.z-lo.z,hi.z-local.z));}
      }
      samples.push({mesh:mesh.name,box:box.name,vertices,inside,maxDepthLocalM:maxDepth});
     }
    });
    return {phase:__contactPhase,ms:performance.now(),outfit:__debug.snapshot().outfit,mode:__debug.snapshot().mode,hair:a.appearance.getState().hairDynamics,samples};
   };
   let previous=null,lastContact=0;
   const tick=now=>{if(previous!==null)__frameIntervals.push({phase:__contactPhase,ms:now-previous});previous=now;
    if(now-lastContact>=200){__contactSamples.push(__readHairContacts());lastContact=now;}
    window.__contactRAF=requestAnimationFrame(tick);
   };window.__contactRAF=requestAnimationFrame(tick);
  });
  await phase('pants-seat');await task('hair-pants-seat','sit');await p.waitForTimeout(1200);await snap('pants-seated-side');
  report.pantsSeated=await p.evaluate(()=>__readHairContacts());
  await phase('pants-rise');await task('hair-pants-rise','stand');
  await task('hair-depart-chair','walk',{x:-1,z:1.8});
  // Same frozen skirt; no shape or solver edits made by this regression.
  assert((await p.evaluate(()=>__debug.setOutfit(1))).applied);
  await phase('skirt-walk');await p.evaluate(()=>{__debug.camera('inspect-full-side');__debug.setSpeed(1.05);});
  await task('hair-skirt-walk','walk',{x:1.1,z:1.8});
  await phase('skirt-run');await p.evaluate(()=>__debug.setSpeed(2.2));await task('hair-skirt-run','walk',{x:-1.3,z:1.8});
  await phase('skirt-dance');await p.evaluate(()=>{__debug.camera('inspect-half-back');__debug.setSpeed(1.05);});
  await task('hair-skirt-dance','dance',{durationSeconds:5});await snap('skirt-dance-ended');
  report.movedChair=await p.evaluate(()=>__debug.setChairTransform({x:2,z:.57332736697,yaw:Math.PI/3}));
  await phase('skirt-moved-seat');await p.evaluate(()=>__debug.camera('inspect-half-side'));await task('hair-skirt-moved-seat','sit');await p.waitForTimeout(1200);await snap('skirt-moved-seated-side');
  report.skirtSeated=await p.evaluate(()=>__readHairContacts());
  await p.evaluate(()=>__debug.camera('inspect-half-back'));await snap('skirt-moved-seated-back');
  await phase('skirt-rise');await task('hair-skirt-rise','stand');await task('hair-skirt-depart','walk',{x:-1,z:1.8});
  assert.equal(await p.evaluate(()=>__debug.seatLeases.forSeat('room-chair-1')),null);
  assert.deepEqual(report.errors,[]);report.status='technical-actions-complete-contact-and-visual-review-required';
 }catch(e){report.status='failed-or-incomplete';report.error=String(e);await snap('failure').catch(()=>{});throw e;}
 finally{
  try{report.measurements=await p.evaluate(()=>{cancelAnimationFrame(window.__contactRAF);window.__restoreHairTimer?.();return{contactSamples:window.__contactSamples,solverTimes:window.__solverTimes,frameIntervals:window.__frameIntervals,device:{userAgent:navigator.userAgent,hardwareConcurrency:navigator.hardwareConcurrency,deviceMemory:navigator.deviceMemory,viewport:[innerWidth,innerHeight]},renderer:__debug.snapshot().renderer};});}catch(e){report.measurementError=String(e);}
  const video=p.video();await ctx.close();await video.saveAs(path.join(out,'normal1x.webm'));await video.delete();await browser.close();
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
 }
 console.log(JSON.stringify({out,status:report.status}));
})().catch(e=>{console.error(e);process.exitCode=1;});
