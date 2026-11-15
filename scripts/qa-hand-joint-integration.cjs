// Affected integration surfaces only. No product imports or runtime mutation.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {expectations,prepareOutput,verifyCandidate,writeFailure}=require('./qa-m1-common.cjs');
const {chromium}=require('../prototype/node_modules/playwright');
(async()=>{
 const expected=expectations(),base=process.argv[2],out=await prepareOutput(expected.build,'joint-integration-small'),browser=await chromium.launch({channel:'chrome',headless:true}),report={build:expected.build,cases:[],errors:[]};
 const male={build:expected.build,assetId:'beta-base-male-m1b',sha256:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'};
 async function open(body,e){const p=await browser.newPage({viewport:{width:1440,height:900}});p.on('pageerror',x=>report.errors.push(String(x)));await p.goto(new URL('?body='+body,base).href);await p.waitForFunction(()=>__debug?.ready,null,{timeout:60000});return {p,identity:await verifyCandidate(p,e)};}
 try{
  // Male material recipe must remain geometry-neutral and restore real originals.
  {const {p,identity}=await open('male',male),r={name:'male-shorts-material-seat',identity};report.cases.push(r);
   try{await p.evaluate(()=>{__debug.setPaused(true);__debug.setOutfit(2);__debug.setPlaybackRate(1);});
    r.material=await p.evaluate(async()=>{
     const d=__debug,a=d.avatar(),id='m1b-uniform-shorts-v1',container=d.scene.getObjectByName('Equipment:'+id),meshes=[];if(!container)throw Error('Shorts missing');container.traverse(m=>{if(m.isSkinnedMesh)meshes.push(m);});if(meshes.length!==2)throw Error('Actual shorts layer count changed');
     const slots=meshes.map(m=>m.material),original=slots.flatMap(x=>Array.isArray(x)?x:[x]),counts={originalDisposed:0,cloneDisposed:0};original.forEach(m=>m.addEventListener('dispose',()=>counts.originalDisposed++));
     const digest=async a=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',a.buffer.slice(a.byteOffset,a.byteOffset+a.byteLength)))].map(x=>x.toString(16).padStart(2,'0')).join('');
     const geometry=async()=>{const result=[];for(const m of meshes){const attrs={};for(const [k,v]of Object.entries(m.geometry.attributes))attrs[k]=await digest(v.array);attrs.index=await digest(m.geometry.index.array);result.push({mesh:m.name,attrs});}return result;};
     const before=await geometry(),selection=await a.setMaterialRecipe(id,'m1b-shorts-cloth-v4-review1');if(!selection.applied)throw Error('Recipe refused');d.renderer.render(d.scene,d.cameraObject());
     const active=meshes.flatMap(m=>Array.isArray(m.material)?m.material:[m.material]);active.forEach(m=>{if(!original.includes(m))m.addEventListener('dispose',()=>counts.cloneDisposed++);});
     const after=await geometry(),alphaUnchanged=active.every((m,i)=>['map','alphaMap','alphaTest','opacity','transparent','side'].every(k=>m[k]===original[i][k]));
     for(const outfit of [0,2,0,2])d.setOutfit(outfit);
     const retained=a.getMaterialRecipeState(id);await a.setMaterialRecipe(id,null);
     return {before,after,selection,retained,restored:meshes.every((m,i)=>m.material===slots[i]),alphaUnchanged,counts,finalRecipe:a.getMaterialRecipeState(id),handProfilePresent:!!a.profile.motion.handSurfaceContact};
    });assert.deepEqual(r.material.before,r.material.after);assert(r.material.alphaUnchanged&&r.material.restored);assert.equal(r.material.counts.originalDisposed,0);assert.equal(r.material.counts.cloneDisposed,2);assert.equal(r.material.finalRecipe.active,null);assert.equal(r.material.handProfilePresent,false);
    await p.evaluate(()=>__debug.setPaused(false));r.tasks=[];
    for(const kind of ['sit','stand']){const id='joint-male-'+kind;await p.evaluate(x=>__debug.request({requestId:x.id,kind:x.kind}),{id,kind});await p.waitForFunction(id=>['completed','failed','cancelled'].includes(__debug.tasks().get(id)?.state),id,{timeout:45000});const task=await p.evaluate(id=>__debug.tasks().get(id),id);assert.equal(task.state,'completed');r.tasks.push(task);}
    r.final=await p.evaluate(()=>({outfit:__debug.snapshot().outfit,mode:__debug.snapshot().mode,handContacts:__debug.motion().getMetrics().handContacts}));assert.equal(r.final.outfit,2);assert(!r.final.handContacts.some(x=>x.handSurfaceMetrics));r.finalGate=await verifyCandidate(p,male);await p.screenshot({path:path.join(out,'male-shorts-restored.png')});r.passed=true;
   }finally{await p.close();}}
  // Two female instances exercise independent joint-hand profile/state storage.
  {const {p,identity}=await open('female',expected),r={name:'female-female-state-and-bad-peer-profile',identity};report.cases.push(r);
   try{r.isolation=await p.evaluate(async()=>{
    const d=__debug;d.reset();d.setPaused(true);d.setOutfit(1);d.setDynamics(false);const a=d.avatar(),m=d.motion(),b=await d.loadComparison('female');b.avatar.setOutfit(1);b.avatar.setDynamics(false);
    const sample=(a,m)=>JSON.stringify({root:a.root.position.toArray(),outfit:a.getOutfitInfo(),bones:Object.entries(a.vrm.humanoid.normalizedHumanBones).map(([n])=>[n,a.vrm.humanoid.getNormalizedBoneNode(n).quaternion.toArray()]),metrics:m.getMetrics()});
    const configIndependent=a.profile.motion.handSurfaceContact.jointProfile!==b.avatar.profile.motion.handSurfaceContact.jointProfile&&a.profile.motion.handSurfaceContact.jointProfile.profiles[0]!==b.avatar.profile.motion.handSurfaceContact.jointProfile.profiles[0];
    const before=sample(a,m);b.action('sit');let ticks=0;for(;ticks<2400;ticks++){b.update(1/120);if(b.motion.getMetrics().sitProgress===1)break;}if(ticks===2400)throw Error('Peer actual chair path timed out');
    const peerActive=b.motion.getMetrics().handContacts.some(x=>x.handSurfaceMetrics?.railCount===80),primaryUnaffected=before===sample(a,m),peerBefore=sample(b.avatar,b.motion);
    a.setExpression('happy');a.setOutfit(0);m.setAction('dance');m.update(.05,{action:'dance',moving:false,speed:0,distanceDelta:0,turning:false});a.update(.05);
    const peerUnaffected=peerBefore===sample(b.avatar,b.motion);d.removeComparison();
    const baseline=sample(a,m),rootIds=()=>d.scene.children.filter(x=>x.name==='M1CompleteFoundation').map(x=>x.uuid);window.__jointPeerGuard={baseline,state:()=>({samePrimary:baseline===sample(a,m),roots:rootIds(),comparison:!!d.comparison()})};
    return{configIndependent,peerActive,primaryUnaffected,peerUnaffected,peerTicks:ticks,peerRemoved:d.comparison()===null,remainingRoots:rootIds().length};
   });for(const k of ['configIndependent','peerActive','primaryUnaffected','peerUnaffected','peerRemoved'])assert(r.isolation[k],k);assert.equal(r.isolation.remainingRoots,1);
    r.badProfiles=[];
    for(const fault of ['sha-mismatch','http-503']){
     const pattern='**/assets/hand-joint-contact-v1/female.json';await p.route(pattern,async route=>fault==='http-503'?route.fulfill({status:503,body:'QA profile unavailable'}):route.fulfill({status:200,contentType:'application/json',body:'{"schema":"m1.semantic-joint-hand-envelope.1","bodySHA256":"bad"}'}));
     let result;try{result=await p.evaluate(async()=>{try{await __debug.loadComparison('female');return{unexpectedSuccess:true,...__jointPeerGuard.state()};}catch(e){return{error:String(e),...__jointPeerGuard.state()};}});}finally{await p.unroute(pattern);}
     assert(!result.unexpectedSuccess&&result.samePrimary&&!result.comparison&&result.roots.length===1);assert.match(result.error,fault==='sha-mismatch'?/integrity mismatch/:/failed to load/);r.badProfiles.push({fault,...result,passed:true});
    }
    r.retry=await p.evaluate(async()=>{const peer=await __debug.loadComparison('female'),profile=peer.avatar.profile;__debug.removeComparison();return{bodySHA:profile.sha256,...__jointPeerGuard.state()};});assert(r.retry.samePrimary&&!r.retry.comparison);r.finalGate=await verifyCandidate(p,expected);r.passed=true;
   }finally{await p.close();}}
  assert.equal(report.errors.length,0);report.passed=true;
 }catch(e){report.failure=String(e);await writeFailure(out,e);throw e;}finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(out);}
})().catch(e=>{console.error(e);process.exitCode=1;});
