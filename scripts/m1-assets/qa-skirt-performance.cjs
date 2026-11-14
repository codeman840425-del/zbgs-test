const {chromium}=require('../../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
(async()=>{
 const url=process.argv[2]||'http://127.0.0.1:5173/',out=path.join(root,'output/playwright/m1-skirt-optimization');await fs.mkdir(out,{recursive:true});
 const sources={reference:await fs.readFile(path.join(root,'assets-source/m1/checkpoints/m1-skirt-66.js'),'utf8'),candidate:await fs.readFile(path.join(root,'prototype/src/m1-skirt.js'),'utf8')};
 const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:1000}});
 try{
 await page.goto(url);await page.waitForFunction(()=>window.__debug?.ready);
 const result=await page.evaluate(async sources=>{
  const THREE=await import('/node_modules/three/build/three.module.js'),d=__debug,c=d.game.scene.getScene('CharacterStudio'),a=d.avatar();d.setPaused(true);d.reset();d.setOutfit(1);d.setBodyMode('dressed');d.setDynamics(true);
  const body=[];a.vrm.scene.traverse(m=>{if(m.isSkinnedMesh&&(Array.isArray(m.material)?m.material:[m.material]).some(x=>/_Body_\d+_SKIN/.test(x.name)))body.push(m);});
  let source;d.scene.getObjectByName('Equipment:m1-uniform-skirt').traverse(m=>{if(m.isSkinnedMesh)source=m;});
  function factory(text){
   text=text.replace(/import \* as THREE from [^;]+;/,'').replace('export function createM1Skirt','function createM1Skirt');
   text=text.replace('function update(_dt = 0, boxes = []) {','function update(_dt = 0, boxes = []) { const timers=[performance.now()];');
   text=text.replace('    maxCorrection = 0;','    timers.push(performance.now());\n    maxCorrection = 0;');
   text=text.replace('    // Jacobi accumulation:','    timers.push(performance.now());\n    // Jacobi accumulation:');
   text=text.replace('    maxEdgeStretch = 1;\n    for', '    timers.push(performance.now());\n    maxEdgeStretch = 1;\n    for');
   text=text.replace('    revision++;','    timers.push(performance.now()); mesh.userData.qaTimes=timers.slice(1).map((t,i)=>t-timers[i]);\n    revision++;');
   return new Function('THREE',text+'; return createM1Skirt;')(THREE)({vrm:a.vrm,source,body});
  }
  const solvers=Object.fromEntries(Object.entries(sources).map(([k,v])=>[k,factory(v)]));Object.values(solvers).forEach(s=>s.mesh.visible=false);
  const data=[],bounds=d.chairColliders();let maxPositionDifference=0,maxNormalDifference=0;
  const setup=kind=>{d.reset();d.setPaused(true);d.setOutfit(1);d.setBodyMode('dressed');d.setDynamics(true);if(kind==='walk'){a.root.position.set(-2.5,0,2.2);c.yaw=Math.PI/2;}else{const seat=d.snapshot().chair;a.root.position.set(...seat.approach);c.yaw=seat.yaw;}a.root.rotation.y=c.yaw;d.motion().reset();a.update(0);a.root.updateMatrixWorld(true);a.resetSecondary?.();for(let i=0;i<120;i++)c.simulate(1/120);if(kind==='walk'){d.setSpeed(.75);c.go(1.5,2.2);}else{c.action('sit');if(kind==='rise'){for(let i=0;i<240;i++)c.simulate(1/120);c.action('stand');}}};
  for(const kind of ['walk','sit','rise']){
   setup(kind);
   for(let f=0;f<240;f++){
    c.simulate(1/120);const row={kind,f,t:f/120};
    for(const name of (f%2?['candidate','reference']:['reference','candidate'])){const solver=solvers[name];const start=performance.now();solver.update(1/120,bounds);row[name]={total:performance.now()-start,stages:solver.mesh.userData.qaTimes,...solver.getInfo()};}
    for(const [attr,label]of [['position','p'],['normal','n']]){const aa=solvers.reference.mesh.geometry.attributes[attr].array,bb=solvers.candidate.mesh.geometry.attributes[attr].array;for(let i=0;i<aa.length;i++){const delta=Math.abs(aa[i]-bb[i]);if(label==='p')maxPositionDifference=Math.max(maxPositionDifference,delta);else maxNormalDifference=Math.max(maxNormalDifference,delta);}}
    data.push(row);
   }
  }
  Object.values(solvers).forEach(s=>s.dispose());source.visible=false;
  return {build:d.buildInfo,ua:navigator.userAgent,data,maxPositionDifference,maxNormalDifference};
 },sources);
 const percentile=(xs,p)=>{xs=xs.slice().sort((a,b)=>a-b);return xs[Math.floor((xs.length-1)*p)];};
 result.summary=['walk','sit','rise'].map(kind=>{const rows=result.data.filter(r=>r.kind===kind&&r.f>=20);return{kind,samples:rows.length,...Object.fromEntries(['reference','candidate'].map(key=>[key,{p50:percentile(rows.map(r=>r[key].total),.5),p95:percentile(rows.map(r=>r[key].total),.95),stagesP50:['matricesAndBounds','poseGuide','constraints','writeNormalsBounds'].map((label,i)=>({label,ms:percentile(rows.map(r=>r[key].stages[i]),.5)}))}]))};});
 result.url=url;result.sourceHashes=Object.fromEntries(Object.entries(sources).map(([k,s])=>[k,hash(s)]));result.observedAt=new Date().toISOString();result.limitations=['Development browser, not fixed66 replay. Both frozen skirt sources evaluated on identical actual current retargeted poses in alternating order.','Offline120Hz solver CPU timings exclude browser frame/render/GPU and include diagnostic timer overhead. First20frames of each case excluded from summary.','Current live runtime supplies poses, so this isolates skirt mathematics and does not compare historical controller versions.'];
 await fs.writeFile(path.join(out,'browser-paired-performance.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,data:undefined},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});

