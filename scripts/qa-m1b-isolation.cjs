// Developer-only independent-instance mutation/disposal check.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const {prepareOutput,verifyCandidate}=require('./qa-m1-common.cjs');
async function hashes(){const p=path.join(root,'prototype/src');return Object.fromEntries(await Promise.all((await fs.readdir(p)).filter(n=>n.endsWith('.js')).sort().map(async n=>[n,crypto.createHash('sha256').update(await fs.readFile(path.join(p,n))).digest('hex')])));}
(async()=>{
 const base=process.argv[2],build=process.argv[3];if(!base||!/^[a-f0-9]{12}$/.test(build||''))throw Error('Require fixed URL and build12');const expected={build,assetId:'beta-base-male-m1b',sha256:'62b44b0372570a821695d236cd412ddf902b6f683023e13fef7293de9c0b35ff'};const out=await prepareOutput(build,'isolation-'+Date.now());let initialGate;
 const start=await hashes(),browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],records=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(new URL('?body=male',base).href);await page.waitForFunction(()=>window.__debug?.ready,{timeout:60000});initialGate=await verifyCandidate(page,expected);
  await page.evaluate(()=>{__debug.setPaused(true);__debug.reset();__debug.setPaused(true);__debug.setDynamics(false);});
  for(const bodyType of ['female','male']){
   const r=await page.evaluate(async bodyType=>{
    const d=__debug,a=d.avatar(),m=d.motion();
    function collect(a){const v={bones:new Set(),skeletons:new Set(),materials:new Set(),geometries:new Set(),textures:new Set(),morphArrays:new Set()};a.root.traverse(o=>{if(o.isBone)v.bones.add(o);if(o.skeleton)v.skeletons.add(o.skeleton);if(o.geometry)v.geometries.add(o.geometry);if(o.morphTargetInfluences)v.morphArrays.add(o.morphTargetInfluences);for(const mat of o.material?(Array.isArray(o.material)?o.material:[o.material]):[]){v.materials.add(mat);for(const val of Object.values(mat))if(val?.isTexture)v.textures.add(val);}});return v;}
    function sample(a,m){const bones={};for(const n of ['hips','head','leftUpperArm','rightUpperArm','leftFoot','rightFoot']){const b=a.vrm.humanoid.getNormalizedBoneNode(n);bones[n]={p:b.position.toArray(),q:b.quaternion.toArray()};}return {bones,metrics:m.getMetrics(),face:['happy','aa','blink'].map(n=>a.vrm.expressionManager.getValue(n)),outfit:a.getOutfitInfo(),debug:a.getDebugState(),root:a.root.position.toArray()};}
    const beforeDom=document.querySelector('.debug-controls').innerHTML;
    const b=await d.loadComparison(bodyType);b.avatar.setDynamics(false);const domUnchanged=beforeDom===document.querySelector('.debug-controls').innerHTML;
    const originalOffset=b.avatar.config.seatLayerThickness;a.config.seatLayerThickness+=.001;const configIndependent=a.config!==b.avatar.config&&b.avatar.config.seatLayerThickness===originalOffset;a.config.seatLayerThickness-=.001;const av=collect(a),bv=collect(b.avatar),shared=Object.fromEntries(Object.keys(av).map(k=>[k,[...av[k]].filter(o=>bv[k].has(o)).length]));
    const mainDisposes=[];for(const key of ['materials','geometries','textures'])for(const o of av[key])o.addEventListener('dispose',()=>mainDisposes.push({kind:key,uuid:o.uuid}));
    const before=JSON.stringify(sample(a,m));b.action('dance');b.avatar.setExpression('aa');b.avatar.setDebugBody(true);for(let i=0;i<90;i++)b.update(1/120);
    const mainUnaffected=before===JSON.stringify(sample(a,m)),peerFace=sample(b.avatar,b.motion).face;
    const peerBefore=JSON.stringify(sample(b.avatar,b.motion));a.setExpression('happy');a.update(.02);a.setDebugBody(true);m.setAction('dance');m.update(.05,{action:'dance',moving:false,speed:0,distanceDelta:0,turning:false});a.update(.05);
    const peerUnaffected=peerBefore===JSON.stringify(sample(b.avatar,b.motion));
    b.avatar.setDebugBody(false);a.setDebugBody(false);d.view('front');d.advance(0);
    const actualHashes={};for(const p of [a.profile,b.avatar.profile])actualHashes[p.bodyType]=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await(await fetch(p.url)).arrayBuffer()))].map(x=>x.toString(16).padStart(2,'0')).join('');
    window.__isolationResult={bodyType,primaryProfile:a.profile,peerProfile:b.avatar.profile,actualHashes,shared,configIndependent,domUnchanged,mainUnaffected,peerUnaffected,peerFace,counts:Object.fromEntries(Object.keys(av).map(k=>[k,{main:av[k].size,peer:bv[k].size}]))};
    window.__isolationFinish=()=>{const peerRoot=b.avatar.root;d.removeComparison();m.setAction('idle');m.update(.05,{action:'idle',moving:false,speed:0,distanceDelta:0,turning:false});a.update(.05);a.root.updateMatrixWorld(true);return {...window.__isolationResult,peerRemoved:!peerRoot.parent,comparisonCleared:d.comparison()===null,mainAttached:!!a.root.parent,mainDisposes,mainFinite:Object.values(sample(a,m).bones).every(x=>[...x.p,...x.q].every(Number.isFinite))};};
    return window.__isolationResult;
   },bodyType);
   await page.screenshot({path:path.join(out,'male-with-'+bodyType+'.png')});
   records.push(await page.evaluate(()=>window.__isolationFinish()));
  }
  const end=await hashes(),report={kind:'fixed instance-isolation diagnostic',initialGate,finalGate:await verifyCandidate(page,expected),start,end,sourceUnchanged:JSON.stringify(start)===JSON.stringify(end),errors,records,limitations:['Only two simultaneous instances, idle/dance mutation probes; not crowd scalability','Paused deterministic updates; not frame-time or memory benchmark','Default face/blink/garment mutation checked, not future accessories or arbitrary body morphs']};
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(out);console.log(JSON.stringify(records.map(r=>({body:r.bodyType,shared:r.shared,mainUnaffected:r.mainUnaffected,peerUnaffected:r.peerUnaffected,mainDisposes:r.mainDisposes,peerRemoved:r.peerRemoved,domUnchanged:r.domUnchanged}))));
  if(errors.length||records.some(r=>Object.values(r.shared).some(Boolean)||!r.mainUnaffected||!r.peerUnaffected||r.mainDisposes.length||!r.peerRemoved||!r.mainAttached||!r.mainFinite||!r.domUnchanged||!r.configIndependent))throw Error('Instance isolation failed; inspect report');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
