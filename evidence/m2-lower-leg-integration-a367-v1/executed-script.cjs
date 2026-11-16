// Affected entry paths for explicit model-floor alignment; no product overrides.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [url,build,dest]=process.argv.slice(2),out=path.resolve(dest);
const derived='m2-male-lower-leg-v1';
(async()=>{
 await fs.mkdir(out,{recursive:false});await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900},recordVideo:{dir:out,size:{width:1440,height:900}}});
 const p=await context.newPage(),report={build,status:'running',checks:[],errors:[],scope:'Actual browser on development PC; engineering contact samples, not continuous collision or human visual approval'};
 p.on('pageerror',e=>report.errors.push(String(e)));
 try{
  await p.goto(url+'?body=male&workbench=appearance');await p.waitForFunction(()=>__debug?.ready,null,{timeout:60000});
  report.identity=await verifyCandidate(p,{build,assetId:'beta-base-male-m1b',sha256:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'});
  await p.evaluate(()=>{
   window.__originalDocument=document;__debug.camera('room');__debug.setPlaybackRate(1);
   window.__floorRead=a=>{let sole=Infinity,count=0;const refs=[];
    a.root.updateMatrixWorld(true);a.vrm.scene.traverse(n=>{if(!n.isSkinnedMesh||!n.parent?.visible)return;
     if(n.parent.userData.equipmentId?.includes('shoes')){refs.push(n.uuid);for(let i=0;i<n.geometry.attributes.position.count;i++){const v=n.position.clone();n.getVertexPosition(i,v);n.localToWorld(v);sole=Math.min(sole,v.y);count++;}}});
    return{body:a.profile.bodyType,sha:a.getAssetProfile().sha256,root:a.root.uuid,modelOffset:a.vrm.scene.position.y,position:a.root.position.toArray(),sole,count,refs};};
  });
  await p.evaluate(body=>__debug.loadComparison(body).then(()=>true),derived);
  await p.waitForTimeout(350);
  const pair=await p.evaluate(()=>({primary:__floorRead(__debug.avatar()),peer:__floorRead(__debug.comparison().avatar)}));
  assert(pair.primary.count&&pair.peer.count);assert.notEqual(pair.primary.root,pair.peer.root);
  assert(Math.abs(pair.primary.modelOffset)<1e-8);assert(Math.abs(pair.peer.modelOffset-.01944977603852749)<1e-8);
  assert(Math.abs(pair.peer.sole)<.003);assert(!pair.peer.refs.some(id=>pair.primary.refs.includes(id)));
  report.checks.push({name:'secondary derived actor has independent rig and floor placement',passed:true,pair});
  await p.screenshot({path:path.join(out,'dual-instance.png')});
  await p.evaluate(()=>{__debug.setPaused(true);__debug.comparison().controller.paused=true;window.__peerSaved=__floorRead(__debug.comparison().avatar);});
  const switched=await p.evaluate(body=>__debug.command({type:'bodySelect',bodyType:body}),derived);assert(switched.applied,JSON.stringify(switched));
  const after=await p.evaluate(()=>({primary:__floorRead(__debug.avatar()),peer:__floorRead(__debug.comparison().avatar),before:__peerSaved,sameDocument:document===__originalDocument}));
  assert(after.sameDocument);assert.equal(after.primary.body,derived);assert.deepEqual(after.peer,after.before);
  assert(Math.abs(after.primary.sole)<.003);assert.notEqual(after.primary.root,after.peer.root);
  report.checks.push({name:'primary switch uses correct floor without changing paused peer',passed:true,switched,after});
  await p.evaluate(()=>{__debug.removeComparison();__debug.setPaused(false);__debug.setSpeed(1.05);__debug.setChairTransform({x:2,z:.57332736697,yaw:Math.PI/3});});
  const terminal=async id=>{await p.waitForFunction(id=>['completed','cancelled','failed'].includes(__debug.tasks().get(id)?.state),id,{timeout:45000});const t=await p.evaluate(id=>__debug.tasks().get(id),id);assert.equal(t.state,'completed',JSON.stringify(t));return t;};
  await p.evaluate(()=>__debug.request({requestId:'derived-rotated-seat',kind:'sit'}));report.sitTask=await terminal('derived-rotated-seat');
  await p.waitForTimeout(500);
  const contact=await p.evaluate(()=>{
   const a=__debug.avatar(),chair=__debug.scene.getObjectByName('RepresentativeChair'),seat=chair.children[0];seat.geometry.computeBoundingBox();
   const top=seat.localToWorld(new seat.position.constructor(0,seat.geometry.boundingBox.max.y,0)).y;
   const bottomIds=new Set(Object.values(a.getEquipmentRecipe(__debug.snapshot().outfit)).filter(e=>e.slot==='bottom').map(e=>e.id));let gap=Infinity,count=0;
   a.vrm.scene.traverse(n=>{if(!n.isSkinnedMesh||!n.parent?.visible||!bottomIds.has(n.parent.userData.equipmentId))return;
    for(let i=0;i<n.geometry.attributes.position.count;i++){const v=n.position.clone();n.getVertexPosition(i,v);n.localToWorld(v);const local=chair.worldToLocal(v.clone());if(Math.abs(local.x)<.275&&Math.abs(local.z)<.25){gap=Math.min(gap,v.y-top);count++;}}});
   return{floor:__floorRead(a),seatTop:top,selectedBottomVertices:count,gap,chair:__debug.snapshot().chair,lease:__debug.seatLeases.forSeat('room-chair-1'),sitProgress:__debug.snapshot().motion.sitProgress};
  });
  assert(contact.selectedBottomVertices>0);assert(Math.abs(contact.floor.sole)<.003);assert(contact.gap>-.003);assert(contact.lease);assert(contact.sitProgress>.999);
  report.checks.push({name:'translated rotated chair uses derived contact calibration',passed:true,contact});
  await p.evaluate(()=>__debug.camera('inspect-full-side'));await p.screenshot({path:path.join(out,'rotated-seated.png')});
  await p.evaluate(()=>__debug.request({requestId:'derived-rise',kind:'stand'}));report.standTask=await terminal('derived-rise');
  await p.evaluate(()=>{__debug.camera('room');__debug.walkTo(-1,1.8);});
  await p.waitForFunction(()=>{const s=__debug.snapshot();return s.mode==='idle'&&!s.target&&!s.pending;},null,{timeout:45000});
  assert.equal(await p.evaluate(()=>__debug.seatLeases.forSeat('room-chair-1')),null);
  await p.evaluate(()=>__debug.setPaused(true));
  const restored=await p.evaluate(()=>__debug.command({type:'bodySelect',bodyType:'male'}));assert(restored.applied);
  const final=await p.evaluate(()=>({floor:__floorRead(__debug.avatar()),sameDocument:document===__originalDocument,peer:__debug.comparison()}));
  assert(final.sameDocument);assert.equal(final.peer,null);assert(Math.abs(final.floor.modelOffset)<1e-8);assert(Math.abs(final.floor.sole)<.003);
  report.checks.push({name:'rise depart releases seat; switching back clears derived placement',passed:true,restored,final});
  await p.screenshot({path:path.join(out,'restored-original.png')});assert.deepEqual(report.errors,[]);
  report.status='technical-checks-passed-visual-pending';
 }catch(e){report.error=String(e);report.status='failed-or-incomplete';await p.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});throw e;}
 finally{const video=p.video();await context.close();await video.saveAs(path.join(out,'normal1x.webm'));await video.delete();await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
 console.log(JSON.stringify({out,status:report.status}));
})().catch(e=>{console.error(e);process.exitCode=1;});
