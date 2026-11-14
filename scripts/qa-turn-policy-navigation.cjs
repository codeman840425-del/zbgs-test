const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage();await page.goto(process.argv[2]||'http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__debug?.ready&&window.__debug.buildInfo?.shortId);
  const build=await page.evaluate(()=>window.__debug.buildInfo);
  if(process.argv[4]&&build.shortId!==process.argv[4])throw Error('Unexpected fixed build: '+build.shortId);
  const report=await page.evaluate(()=>{
   const d=__debug,c=d.game.scene.getScene('CharacterStudio'),results=[];
   for(const chair of [{x:2,z:.57332736697,yaw:Math.PI/3},{x:1.35,z:.27332736697,yaw:Math.PI/3},{x:2.65,z:.89,yaw:0}]){
    c.reset();c.paused=true;d.setChairTransform(chair);c.action('sit');
    const initial={target:c.target?.slice(),path:c.path.map(p=>p.slice())};let collisions=0,frames=0;
    for(;frames<2400;frames++){c.simulate(1/120);const s=d.snapshot();collisions+=Number(s.collision);if(c.mode==='sit'&&s.motion.transitionComplete)break;}
    results.push({chair,initial,seconds:frames/120,completed:c.mode==='sit'&&d.snapshot().motion.transitionComplete,collisions,final:{mode:c.mode,target:c.target,seatAlign:c.seatAlign,position:d.avatar().root.position.toArray()}});
   }
   return{kind:'actual room regression for a rotated-chair corner skipped by 6cm segment samples',build:d.buildInfo,asset:d.avatar().profile,results};
  });
  const out=process.argv[3]||'output/playwright/turn-policy';await fs.mkdir(out,{recursive:true});await fs.writeFile(out+'/navigation.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report.results,null,2));
  if(report.results.some(r=>!r.completed||r.collisions))process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
