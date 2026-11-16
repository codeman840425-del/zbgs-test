const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('../prototype/node_modules/playwright');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const arg=n=>process.argv.find(a=>a.startsWith('--'+n+'='))?.slice(n.length+3);
const BASE=process.argv[2],BUILD=arg('build'),OUT=path.resolve(arg('out')),REF=arg('reference');
const IDS={female:['beta-base-female-m1','027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'],male:['beta-base-male-m1b','62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff']};
const cases=[{id:'original',patch:{},weights:{}},{id:'mouth-minus',patch:{mouthWidth:-.12},weights:{aa:1}},{id:'mouth-plus',patch:{mouthWidth:.12},weights:{happy:.65,blink:.5,aa:.5}},{id:'eye-closed',patch:{eyeSample:'aperture-width105-v2'},weights:{blink:1}},{id:'combined-gaze',patch:{mouthWidth:.12,browSample:'height3-spacing3-v2',noseSample:'tip-forward2-v2',eyeSample:'aperture-width105-v2'},weights:{happy:.65,blink:.5,aa:.5},gaze:true},{id:'reset',patch:{},weights:{}}];
const allShots=['female','male'].flatMap(sex=>cases.flatMap(item=>['front','diagonal'].map(direction=>sex+'-'+item.id+'-'+direction)));
const selected=arg('shots')?.split(',');if(selected)assert(selected.length&&selected.every(s=>allShots.includes(s))&&new Set(selected).size===selected.length,'Unknown/duplicate --shots');
const R={build:BUILD,base:BASE,scope:'Paused exact raw/normalized node transforms and fixed renderer camera/light pairs; not live-animation acceptance or performance.',checks:[],shots:[],errors:[],network:[],bodies:[]};
R.selectedShots=selected||allShots;R.badSourceCheckEnabled=!selected;
async function ready(p){await p.waitForFunction(()=>__debug?.ready&&!__debug.snapshot().bodySelection.loading,null,{timeout:60000})}
(async()=>{await fs.mkdir(OUT);await fs.copyFile(__filename,path.join(OUT,'executed-script.cjs'));const browser=await chromium.launch({channel:'chrome',headless:true});try{
for(const sex of ['female','male']){
 if(selected&&!selected.some(s=>s.startsWith(sex+'-')))continue;
 const context=await browser.newContext({viewport:{width:1600,height:1000}}),p=await context.newPage();p.on('pageerror',e=>R.errors.push(String(e)));p.on('response',r=>{if(r.status()>=400)R.network.push({url:r.url(),status:r.status()})});
 await p.goto(BASE+'?workbench=appearance&body='+sex);await ready(p);R.bodies.push(await verifyCandidate(p,{build:BUILD,assetId:IDS[sex][0],sha256:IDS[sex][1]}));
 await p.evaluate(()=>{const d=__debug;d.reset();d.command({type:'speaking',value:false});d.setDynamics(false);d.setPaused(true);window.__cgOriginal=[];d.avatar().vrm.scene.traverse(m=>{if(m.isMesh)__cgOriginal.push([m,m.geometry])});});
 let pose=REF?JSON.parse(await fs.readFile(path.join(REF,sex+'-pose.json'),'utf8')):await p.evaluate(()=>{const d=__debug,a=d.avatar(),nodes=[];a.vrm.scene.traverse(n=>nodes.push({name:n.name,p:n.position.toArray(),q:n.quaternion.toArray(),s:n.scale.toArray()}));return{nodes,root:{p:a.root.position.toArray(),q:a.root.quaternion.toArray(),s:a.root.scale.toArray()},sim:d.snapshot().simulationTime};});
 await fs.writeFile(path.join(OUT,sex+'-pose.json'),JSON.stringify(pose));
 for(const item of cases){
  if(selected&&!selected.some(s=>s.startsWith(sex+'-'+item.id+'-')))continue;
  const result=await p.evaluate(async patch=>{const f=__debug.avatar().facialGeometry;const reset=await f.set({reset:true});if(!reset.applied)return reset;return Object.keys(patch).length?f.set(patch):reset},item.patch);assert(result.applied,JSON.stringify(result));
  for(const direction of ['front','diagonal']){
   if(selected&&!selected.includes(sex+'-'+item.id+'-'+direction))continue;
   const v=await p.evaluate(({pose,item,direction})=>{
    const d=__debug,a=d.avatar(),em=a.vrm.expressionManager,nodes=[];a.vrm.scene.traverse(n=>nodes.push(n));if(nodes.length!==pose.nodes.length)throw Error('Node topology differs');
    a.root.position.fromArray(pose.root.p);a.root.quaternion.fromArray(pose.root.q);a.root.scale.fromArray(pose.root.s);
    nodes.forEach((n,i)=>{const s=pose.nodes[i];if(n.name!==s.name)throw Error('Node ordering differs');n.position.fromArray(s.p);n.quaternion.fromArray(s.q);n.scale.fromArray(s.s);});a.root.updateMatrixWorld(true);
    if(item.gaze){const h=a.vrm.humanoid.getRawBoneNode('head').getWorldPosition(a.root.position.clone());a.vrm.lookAt.lookAt(h.add(a.root.position.clone().set(.4,.04,.9)));a.vrm.lookAt.update(0);a.vrm.humanoid.update();a.root.updateMatrixWorld(true);}
    for(const e of em.expressions)em.setValue(e.expressionName,0);for(const [k,w]of Object.entries(item.weights))em.setValue(k,w);a.livePresentation.refreshEyeBlinkCompatibility();a.root.updateMatrixWorld(true);a.vrm.scene.traverse(m=>{if(m.isSkinnedMesh)m.skeleton.update()});
    const cam=d.cameraObject(),old={p:cam.position.clone(),q:cam.quaternion.clone()},target=a.vrm.humanoid.getRawBoneNode('head').getWorldPosition(cam.position.clone());target.y+=.035;const offset=cam.position.clone().set(0,0,.78).applyAxisAngle(cam.position.clone().set(0,1,0),a.root.rotation.y+(direction==='diagonal'?Math.PI/4:0));cam.position.copy(target).add(offset);cam.lookAt(target);cam.updateMatrixWorld(true);d.renderer.render(d.scene,cam);
    const bones=[];a.vrm.scene.traverse(n=>{if(n.isBone)bones.push([n.name,n.matrixWorld.toArray()])});const lights=[];d.scene.traverse(n=>{if(n.isLight)lights.push({name:n.name,type:n.type,intensity:n.intensity,color:n.color.toArray(),matrix:n.matrixWorld.toArray(),shadow:n.shadow?{bias:n.shadow.bias,normalBias:n.shadow.normalBias,mapSize:n.shadow.mapSize.toArray(),projection:n.shadow.camera.projectionMatrix.toArray()}:null})});
    const blink=a.livePresentation.getState().eyeBlinkCompatibility;const value={png:d.renderer.domElement.toDataURL(),sim:d.snapshot().simulationTime,bones,camera:{matrix:cam.matrixWorld.toArray(),projection:cam.projectionMatrix.toArray()},lights,weights:Object.fromEntries(em.expressions.map(e=>[e.expressionName,em.getValue(e.expressionName)])),blink:{available:blink.available,coefficient:blink.coefficient,mode:blink.mode,targets:blink.targetedMeshes.map(m=>m.name),protected:blink.protectedMeshes.map(m=>m.name)},geometry:a.facialGeometry.getState(),sourceRestored:__cgOriginal.every(([m,g])=>m.geometry===g)};
    cam.position.copy(old.p);cam.quaternion.copy(old.q);cam.updateMatrixWorld(true);return value;
   },{pose,item,direction});
   const name=sex+'-'+item.id+'-'+direction;await fs.writeFile(path.join(OUT,name+'.png'),Buffer.from(v.png.split(',')[1],'base64'));delete v.png;await fs.writeFile(path.join(OUT,name+'.json'),JSON.stringify(v));R.shots.push(name+'.png');assert(v.blink.available,'private blink registered');assert.equal(v.blink.coefficient,(item.weights.happy||0)*(item.weights.blink||0));assert.equal(v.sim,pose.sim,'clock unchanged');
   if(REF){const old=JSON.parse(await fs.readFile(path.join(REF,name+'.json'),'utf8'));for(const key of ['sim','bones','camera','lights','weights','blink','geometry'])assert.deepEqual(JSON.parse(JSON.stringify(v[key])),old[key],name+':'+key);}
   if(item.id==='reset')assert(v.sourceRestored);R.checks.push({name,pausedPoseMatched:!!REF,passed:true});
  }
 }
 if(REF&&sex==='female'&&!selected){
  const before=await p.evaluate(()=>({root:__debug.avatar().root.uuid,geometry:__debug.avatar().facialGeometry.getState()}));
  await p.route('**/base-male-roundtrip.vrm',async route=>{const r=await route.fetch(),bytes=await r.body();bytes[bytes.length-1]^=1;await route.fulfill({response:r,body:bytes});});
  const rejected=await p.evaluate(()=>__debug.command({type:'bodySelect',bodyType:'male'}));assert(!rejected.applied);assert.match(rejected.reason,/identity/i);assert.deepEqual(await p.evaluate(()=>({root:__debug.avatar().root.uuid,geometry:__debug.avatar().facialGeometry.getState()})),before);
  await p.unroute('**/base-male-roundtrip.vrm');const retry=await p.evaluate(()=>__debug.command({type:'bodySelect',bodyType:'male'}));assert(retry.applied);R.checks.push({name:'bad exact avatar bytes rejected and retry',passed:true,rejected,retry});
 }
 await context.close();await fs.writeFile(path.join(OUT,'report.json'),JSON.stringify(R,null,2));console.log('FINISHED',sex);
}
assert.equal(R.errors.length,0);assert.equal(R.network.length,0);R.status='technical-passed-pixel-review-pending';
}catch(e){R.status='failure-preserved';R.error=String(e);process.exitCode=1;console.error(e);}finally{await browser.close();await fs.writeFile(path.join(OUT,'report.json'),JSON.stringify(R,null,2));console.log('CLOSED',OUT,R.status);}})();
