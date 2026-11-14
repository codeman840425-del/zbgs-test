// Fixed-candidate contact collection for two independently identified variants.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path');
const {prepareOutput,verifyCandidate,writeFailure}=require('./qa-m1-common.cjs');
const root=path.resolve(__dirname,'..');
const variants=[
 {id:'m1a-jaw-v1',sha256:'3c11caaed49f6db514acb7678551352afdf1c2893ef92ca93b959a8d09691011'},
 {id:'m1a-waisthip-v1',sha256:'10778174ece87e3e3a00ecaf5e0c98eef59cd7d762e9bb52daa50162ee1743b5'},
];
(async()=>{
 const base=process.argv[2],build=process.argv[3];if(!base||!/^[a-f0-9]{12}$/.test(build||''))throw Error('Usage: node scripts/qa-m1-variant-contacts.cjs FIXED_BASE_URL BUILD12');
 const out=await prepareOutput(build,'variant-contacts-'+Date.now()),browser=await chromium.launch({channel:'chrome',headless:true}),errors=[],records=[],receipts=[];
 try{for(const spec of variants){
  const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push({id:spec.id,error:e.message}));
  await page.goto(new URL('?body='+spec.id,base).href);await page.waitForFunction(()=>window.__debug?.ready,{timeout:60000});
  const expected={build,assetId:spec.id,sha256:spec.sha256};receipts.push({stage:'before',...await verifyCandidate(page,expected)});
  await page.evaluate(async code=>(await import(URL.createObjectURL(new Blob([code],{type:'text/javascript'})))).installM1Probes(),await fs.readFile(path.join(root,'scripts/qa-m1-probes.mjs'),'utf8'));
  const defaultChair=await page.evaluate(()=>__debug.snapshot().chair);
  const cases=[{name:'default',dx:0,dz:0,yaw:defaultChair.yaw},{name:'rotated',dx:-1.3,dz:-.6,yaw:Math.PI/3},{name:'corner',dx:-.65,dz:-.3,yaw:Math.PI/3}];
  for(const bodyMode of ['base','pants'])for(const chairCase of cases){
   const record=await page.evaluate(({bodyMode,chairCase,defaultChair})=>{
    const d=__debug,c=d.game.scene.getScene('CharacterStudio'),q=__m1qa;
    d.reset();d.setPaused(true);d.setBodyMode(bodyMode==='base'?'base':'dressed');d.setOutfit(0);d.setDynamics(false);d.setSpeed(.85);
    d.setChairTransform({x:defaultChair.position[0]+chairCase.dx,z:defaultChair.position[2]+chairCase.dz,yaw:chairCase.yaw});
    for(let i=0;i<120;i++)c.simulate(1/120);q.resetHistory();
    const capture=()=>{const s=q.seat(),m=d.motion().getMetrics();return {mode:c.mode,position:d.avatar().root.position.toArray(),sitProgress:m.sitProgress,phase:m.phase,feet:q.feet(),meshes:s.meshes};};
    const r={bodyMode,chairCase,chair:d.snapshot().chair,initialSeatLayerThickness:d.avatar().config.seatLayerThickness,idle:capture(),frames:[]};
    c.action('sit');let i=0;for(;i<3600;i++){c.simulate(1/120);if(c.mode==='sit'&&i%4===0)r.frames.push({phase:'sit',tick:i,...capture()});if(c.mode==='sit'&&d.motion().getMetrics().sitProgress>.999)break;}
    r.seatTicks=i;r.timedOut=i===3600;for(let j=0;j<120;j++)c.simulate(1/120);r.seated=capture();d.view('side');d.advance(0);window.__variantPending=r;return {seatTicks:i,timedOut:r.timedOut};
   },{bodyMode,chairCase,defaultChair});
   await page.screenshot({path:path.join(out,`${spec.id}-${bodyMode}-${chairCase.name}-seat.png`)});
   const r=await page.evaluate(()=>{
    const d=__debug,c=d.game.scene.getScene('CharacterStudio'),q=__m1qa,r=window.__variantPending;c.action('stand');let i=0;
    for(;i<1800&&c.mode!=='idle';i++){c.simulate(1/120);if(i%4===0)r.frames.push({phase:'stand',tick:i,mode:c.mode,sitProgress:d.motion().getMetrics().sitProgress,feet:q.feet(),meshes:q.seat().meshes});}
    for(let j=0;j<120;j++)c.simulate(1/120);r.standing={completed:c.mode==='idle',feet:q.feet(),meshes:q.seat().meshes};return r;
   });
   records.push({id:spec.id,...r});await fs.writeFile(path.join(out,`${spec.id}-${bodyMode}-${chairCase.name}.json`),JSON.stringify(r));console.log(spec.id,bodyMode,chairCase.name,record.timedOut?'TIMEOUT':'seated');
  }
  const derivative=await page.evaluate(defaultChair=>{
   const d=__debug,c=d.game.scene.getScene('CharacterStudio'),a=d.avatar(),original=a.config.seatLayerThickness,rows=[];
   try{for(const offset of [0,.01]){a.config.seatLayerThickness=offset;d.reset();d.setPaused(true);d.setBodyMode('dressed');d.setOutfit(0);d.setDynamics(false);d.setChairTransform({x:defaultChair.position[0],z:defaultChair.position[2],yaw:defaultChair.yaw});for(let i=0;i<120;i++)c.simulate(1/120);c.action('sit');let i=0;for(;i<3600;i++){c.simulate(1/120);if(c.mode==='sit'&&d.motion().getMetrics().sitProgress>.999)break;}for(let j=0;j<120;j++)c.simulate(1/120);rows.push({offset,timedOut:i===3600,meshes:__m1qa.seat().meshes.filter(m=>['body','pants'].includes(m.role)),feet:__m1qa.feet()});}return {original,rows};}finally{a.config.seatLayerThickness=original;}
  },defaultChair);
  await fs.writeFile(path.join(out,spec.id+'-offset-derivative.json'),JSON.stringify(derivative,null,2));
  receipts.push({stage:'after',...await verifyCandidate(page,expected)});await page.close();
 }
 const summarize=r=>{const samples=[r.idle,r.seated,r.standing,...r.frames],collisions=[];for(const s of samples)for(const m of s.meshes)for(const [collider,h]of Object.entries(m.collisions))if(h.vertices)collisions.push({role:m.role,mesh:m.mesh,collider,depth:h.maxInteriorDepth,vertices:h.vertices,phase:s.phase??s.mode});return {id:r.id,mode:r.bodyMode,chair:r.chairCase,timeout:r.timedOut,standCompleted:r.standing.completed,maxCollision:collisions.sort((a,b)=>b.depth-a.depth)[0]??null,seatedGaps:r.seated.meshes.filter(m=>['body','pants'].includes(m.role)).map(m=>({role:m.role,gap:m.minPelvisLocalGap})),minFootHeight:Math.min(...samples.flatMap(s=>s.feet.filter(f=>f.measured).map(f=>f.minHeight)))};};
 const report={build,receipts,errors,summary:records.map(summarize),limitations:['Actual referenced vertices in chair-local boxes; not triangle/swept volume acceptance','120Hz simulation; surfaces30Hz, not performance or full continuous video','Default/rotated/corner chairs, base/pants; skirt body-fit needs separate observation','Offset0/.01 is diagnostic per-body fit response only; not silently stored in product']};
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(out);console.log(JSON.stringify(report.summary));
 if(errors.length||report.summary.some(r=>r.timeout||!r.standCompleted||r.maxCollision))throw Error('Variant contacts contain incomplete states or actual vertex penetration; inspect retained evidence');
 }catch(e){await writeFailure(out,e,{errors,receipts,completedCases:records.length});throw e;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
