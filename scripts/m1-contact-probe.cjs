const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 page.on('pageerror',e=>console.error(e.message));
 await page.goto(process.argv[2]||'http://127.0.0.1:5173/');
 await page.waitForFunction(()=>window.__debug?.ready);
 await page.evaluate(async code=>{const m=await import(URL.createObjectURL(new Blob([code],{type:'text/javascript'})));m.installM1Probes();},await fs.readFile('scripts/qa-m1-probes.mjs','utf8'));
 const result=await page.evaluate(({mode,outfit})=>{
  const d=__debug,c=d.game.scene.getScene('CharacterStudio');d.setPaused(true);d.reset();d.setPaused(true);d.view('side');
  d.setBodyMode(mode);d.setOutfit(outfit);
  for(let i=0;i<120;i++)c.simulate(1/120);
  const idle={feet:__m1qa.feet(),metrics:d.motion().getMetrics()};
  c.action('sit');let n=0;while(n++<7200&&!(c.mode==='sit'&&d.motion().getMetrics().sitProgress>.999))c.simulate(1/120);
  for(let i=0;i<120;i++)c.simulate(1/120);
  return {idle,frames:n,seated:{feet:__m1qa.feet(),seat:__m1qa.seat(),metrics:d.motion().getMetrics()}};
 },{mode:process.argv[3]||'base',outfit:Number(process.argv[4]||0)});
 if(process.argv[5]==='rise')await page.evaluate(()=>{const d=__debug,c=d.game.scene.getScene('CharacterStudio');c.action('stand');for(let i=0;i<60;i++)c.simulate(1/120);});
 result.finalHands=await page.evaluate(()=>__debug.motion().getMetrics().handContacts);
 await page.screenshot({path:'output/playwright/m1-contact-side.png'});
 await fs.writeFile('output/playwright/m1-contact-probe.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify({frames:result.frames,hands:result.finalHands,clearance:result.seated.metrics.seatPelvisClearance,idleFeet:result.idle.feet.map(f=>f.minHeight),seatFeet:result.seated.feet.map(f=>f.minHeight),seat:result.seated.seat.meshes.filter(m=>['body','pants','top','skirt'].includes(m.role))},null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
