const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path');
const {expectations,prepareOutput,verifyCandidate,writeFailure}=require('./qa-m1-common.cjs');
(async()=>{
 const identity=expectations(),url=process.argv[2],expected=identity.build;if(!url)throw Error('Require explicit fixed URL');
 const out=await prepareOutput(expected,'interactions');let initialGate,report;
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(url);await page.waitForFunction(()=>__debug?.ready&&__debug.buildInfo?.shortId);
  initialGate=await verifyCandidate(page,identity);await fs.writeFile(path.join(out,'start-manifest.json'),JSON.stringify({url,initialGate},null,2));
  await page.evaluate(async code=>{const m=await import(URL.createObjectURL(new Blob([code],{type:'text/javascript'})));m.installM1Probes();},await fs.readFile(path.join(__dirname,'qa-m1-probes.mjs'),'utf8'));
  const inventory=await page.evaluate(()=>__m1qa.inventory());
  report=await page.evaluate(()=>{
   const d=__debug,c=d.game.scene.getScene('CharacterStudio'),q=__m1qa,records=[],dt=1/120,target=[-.5,2.1];
   const step=()=>c.simulate(dt),settle=(n=120)=>{for(let i=0;i<n;i++)step();},reset=()=>{d.reset();d.setPaused(true);d.setBodyMode('dressed');d.setDynamics(true);d.setOutfit(0);settle();};
   for(const fraction of [.25,.65]){
    reset();c.action('sit');let count=0;while(count++<7200&&d.motion().getMetrics().sitProgress<fraction)step();if(count>=7200)throw Error('Required sit interruption phase never reached');
    const before=d.snapshot();c.go(...target);const immediate=d.snapshot();let frames=0,maxHipStep=0,previous=d.motion().getMetrics().hipWorld;
    while(frames++<7200){step();const s=d.snapshot(),hip=s.motion.hipWorld;maxHipStep=Math.max(maxHipStep,Math.hypot(...hip.map((v,i)=>v-previous[i])));previous=hip;if(!s.target&&!s.pending&&s.mode==='idle'&&Math.hypot(s.position[0]-target[0],s.position[2]-target[1])<.05)break;}
    records.push({kind:'sit-to-walk',fraction,before,immediate,after:d.snapshot(),frames,maxHipStep,reached:frames<7200});
   }
   reset();c.action('dance');settle(180);const before=d.snapshot();c.go(...target);let frames=0;while(frames++<7200){step();const s=d.snapshot();if(!s.target&&!s.pending&&s.mode==='idle'&&Math.hypot(s.position[0]-target[0],s.position[2]-target[1])<.05)break;}records.push({kind:'dance-to-walk',before,after:d.snapshot(),frames,reached:frames<7200});
   for(const pose of ['standing','seated']){
    reset();if(pose==='seated'){c.action('sit');let i=0;while(i++<7200&&d.motion().getMetrics().sitProgress<.999)step();if(i>=7200)throw Error('Seat timeout');settle();}
    const states=[];
    for(const outfit of [1,0,1,0]){d.setOutfit(outfit);for(let i=0;i<60;i++){step();if([0,1,3,11,59].includes(i))states.push({outfit,frame:i,contact:q.seat(),feet:q.feet()});}}
    records.push({kind:'outfit-change',pose,states});
   }
   return {records,final:d.snapshot()};
  });
  const finalGate=await verifyCandidate(page,identity);await page.screenshot({path:path.join(out,'seated-after-swaps.png')});
  await fs.writeFile(path.join(out,'observations.json'),JSON.stringify({url,initialGate,finalGate,inventory,...report,errors,limitations:'120Hz accelerated numeric state/geometry checks, not visual playback acceptance; frame sampling0/1/3/11/59 during outfit switches'},null,2));console.log(out,report.records.filter(x=>x.reached!==undefined).map(x=>({kind:x.kind,reached:x.reached,frames:x.frames,maxHipStep:x.maxHipStep})),errors);
  const invalid=report.records.some(r=>r.reached===false||r.states?.some(s=>s.contact.meshes.some(m=>m.nonFiniteVertices||Object.values(m.collisions).some(h=>h.vertices))));
  if(errors.length||invalid)throw Error('Interaction states or sampled geometry failed; inspect observations');
 }catch(error){await writeFailure(out,error,{initialGate,report,errors});throw error;}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
