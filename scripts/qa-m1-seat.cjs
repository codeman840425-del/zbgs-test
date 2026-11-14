// Bounded developer-candidate seat check. Uses actual referenced CPU-skinned
// geometry; does not convert a changing dev build into release acceptance.
const { chromium } = require('../prototype/node_modules/playwright');
const fs = require('node:fs/promises'), path = require('node:path'), crypto = require('node:crypto');
const {expectations,prepareOutput,verifyCandidate,writeFailure}=require('./qa-m1-common.cjs');
async function sourceHashes() {
  const names=(await fs.readdir(path.join(__dirname,'../prototype/src'))).filter(n=>n.endsWith('.js')).sort();
  return Object.fromEntries(await Promise.all(names.map(async n=>[n,crypto.createHash('sha256').update(await fs.readFile(path.join(__dirname,'../prototype/src',n))).digest('hex')])));
}
(async()=>{
  const identity=expectations(),expectedAsset=identity.sha256,startHashes=await sourceHashes(), url=process.argv[2];if(!url)throw Error('Require explicit fixed URL');
  const out=await prepareOutput(identity.build,'seat-'+Date.now()),records=[];let initialGate;
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try {
    await page.goto(url);await page.waitForFunction(()=>window.__debug?.ready&&window.__debug.buildInfo?.shortId);
    initialGate=await verifyCandidate(page,identity);
    const build=await page.evaluate(()=>__debug.buildInfo);
    await page.evaluate(async code=>{const m=await import(URL.createObjectURL(new Blob([code],{type:'text/javascript'})));m.installM1Probes();},await fs.readFile(path.join(__dirname,'qa-m1-probes.mjs'),'utf8'));
    const inventory=await page.evaluate(()=>__m1qa.inventory());
    if(inventory.profile.id!==identity.assetId||inventory.profile.sha256!==expectedAsset)throw Error('Wrong primary avatar identity');
    const actualHash=await page.evaluate(async()=>{const bytes=await(await fetch(__debug.avatar().profile.url)).arrayBuffer();return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');});
    if(actualHash!==expectedAsset)throw Error('Primary VRM bytes mismatch');
    await fs.writeFile(path.join(out,'start-manifest.json'),JSON.stringify({url,build,initialGate,assetSha256:actualHash,startHashes,status:'collection started; observations.json required for completed run'},null,2));
    const defaultChair=await page.evaluate(()=>__debug.snapshot().chair);
    const chairCases=[{name:'default',dx:0,dz:0,yaw:defaultChair.yaw},{name:'rotated',dx:-1.3,dz:-.6,yaw:Math.PI/3},{name:'corner-regression',dx:-.65,dz:-.3,yaw:Math.PI/3}];
    for(const name of ['base','pants'])for(const chairCase of chairCases) {
      const item=await page.evaluate(({name,chairCase,defaultChair})=>{
        const d=__debug,q=__m1qa,c=d.game.scene.getScene('CharacterStudio');
        d.reset();d.setPaused(true);d.setBodyMode(name==='base'?'base':'dressed');d.setOutfit(0);d.setDynamics(false);
        d.setChairTransform({x:defaultChair.position[0]+chairCase.dx,z:defaultChair.position[2]+chairCase.dz,yaw:chairCase.yaw});
        for(let i=0;i<120;i++)c.simulate(1/120);
        q.resetHistory();const idle={feet:q.feet(),pose:q.pose(),state:d.snapshot()},frames=[];
        const capture=(phase,i)=>({phase,t:i/120,mode:c.mode,feet:q.feet(),seat:q.seat(),pose:q.pose()});
        c.action('sit');let i=0;
        for(;i<7200;i++){
          c.simulate(1/120);
          if(c.mode==='sit'&&i%4===0)frames.push(capture('sit',i));
          if(c.mode==='sit'&&d.motion().getMetrics().sitProgress>.999)break;
        }
        const timedOut=i===7200;
        for(let j=0;j<120;j++)c.simulate(1/120);
        const seated=capture('seated',i+120);
        window.__m1SeatPending={idle,frames,seated,chair:d.snapshot().chair,seatFrames:i,timedOut,controller:{mode:c.mode,target:c.target,path:c.path,pending:c.pending,seatAlign:c.seatAlign,afterWalk:c.afterWalk,position:d.avatar().root.position.toArray()}};
        d.view('side');
        return {seatFrames:i,chair:d.snapshot().chair};
      },{name,chairCase,defaultChair});
      await page.screenshot({path:path.join(out,`${name}-${chairCase.name}-seated.png`)});
      const result=await page.evaluate(()=>{
        const d=__debug,q=__m1qa,c=d.game.scene.getScene('CharacterStudio'),result=window.__m1SeatPending;
        c.action('stand');let i=0;
        for(;i<1800&&c.mode!=='idle';i++){
          c.simulate(1/120);
          if(i%4===0)result.frames.push({phase:'stand',t:i/120,mode:c.mode,feet:q.feet(),seat:q.seat(),pose:q.pose()});
        }
        for(let j=0;j<120;j++)c.simulate(1/120);
        result.standing={completed:c.mode==='idle',feet:q.feet(),seat:q.seat(),pose:q.pose(),state:d.snapshot()};
        return result;
      });
      records.push({name,chairCase,...result});await fs.writeFile(path.join(out,`${name}-${chairCase.name}.json`),JSON.stringify(records.at(-1),null,2));console.log(name,chairCase.name,'seatFrames',item.seatFrames,'timeout',result.timedOut);
    }
    const finalGate=await verifyCandidate(page,identity),endHashes=await sourceHashes();const report={url,build,initialGate,finalGate,inventory,assetSha256:actualHash,startHashes,endHashes,sourceUnchanged:JSON.stringify(startHashes)===JSON.stringify(endHashes),errors,records,limitations:['Fixed served/runtime candidate and primary avatar checked before/after; workspace source hashes are context only, not served bundle verification','1/120 simulation, geometry every fourth step during sit/stand; not wall-time or FPS','Actual vertex/local-box tests do not prove triangle or swept collision absence','No old-body acceptance inherited; base/pants only; dynamics disabled to isolate seat']};
    await fs.writeFile(path.join(out,'observations.json'),JSON.stringify(report,null,2));console.log(out,report.sourceUnchanged?'source unchanged':'SOURCE CHANGED');
    const badContact=records.some(r=>[r.seated.seat,r.standing.seat,...r.frames.map(f=>f.seat)].some(s=>s.meshes.some(m=>m.nonFiniteVertices||Object.values(m.collisions).some(h=>h.vertices))));
    if(errors.length||badContact||records.some(r=>r.timedOut||!r.standing.completed))throw Error('Seat collection has runtime errors, incomplete states or actual vertex penetration; inspect observations');
  }catch(error){await writeFailure(out,error,{initialGate,records,errors});throw error;} finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
