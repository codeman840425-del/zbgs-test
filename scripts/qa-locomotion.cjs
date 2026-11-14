// Accelerated numerical checks execute the actual loaded Phaser simulation.
// They complement, and never replace, realtime complete-animation recording.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();
 try{
  await page.goto(process.argv[2]||'http://127.0.0.1:5173');await page.waitForFunction(()=>window.__debug?.ready);
  const report=await page.evaluate(()=>{
   const d=window.__debug,c=d.game.scene.getScene('CharacterStudio'),results=[];c.paused=true;
   for(const speed of [.45,.85,1.3]){
    c.reset();c.paused=true;c.setSpeed(speed);c.route('directions');
    let frames=0,contacts=0,maxSlip=0,maxTravel=0,clamps=0,collisions=0,rawError=0,worst=null,worstTravel=null;
    while(frames<16000&&(c.sequence.length||c.target||c.speed>.01)){
     c.simulate(1/60);frames++;
     const s=d.snapshot();collisions+=s.collision;
     for(const f of s.feet)if(f.contact&&s.motion.moving){
      contacts++;if(f.slip>maxSlip){maxSlip=f.slip;worst=s;}
      if(f.contactTravel>maxTravel){maxTravel=f.contactTravel;worstTravel=s;}clamps+=f.reachClamp;
      const name=f.side+'Foot',v=d.avatar().vrm;
      const raw=v.humanoid.getRawBoneNode(name),norm=v.humanoid.getNormalizedBoneNode(name);
      rawError=Math.max(rawError,raw.getWorldPosition(raw.position.clone()).distanceTo(norm.getWorldPosition(norm.position.clone())));
     }
    }
    results.push({speed,frames,completed:!c.sequence.length&&!c.target,contacts,maxSlip,maxTravel,clamps,collisions,rawError,worst,worstTravel});
   }
   return {kind:'accelerated actual runtime; not realtime visual or performance acceptance',results};
  });
  report.numericalChecksPassed=report.results.every(r=>r.completed&&r.collisions===0&&r.clamps===0&&r.maxSlip<.005&&r.maxTravel<.005&&r.rawError<.0001);
  if(!report.numericalChecksPassed)process.exitCode=1;
  const out=path.resolve(__dirname,'../output/playwright/locomotion.json');await fs.mkdir(path.dirname(out),{recursive:true});await fs.writeFile(out,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report.results.map(({worst,worstTravel,...r})=>r),null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
