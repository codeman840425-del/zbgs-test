async(page)=>{
 const out=[];await page.waitForFunction(()=>__debug?.ready);await page.setViewportSize({width:1440,height:1400});
 for(const view of ['front','side']){
  await page.evaluate(view=>{
   const d=__debug;d.setPaused(true);d.reset();d.setBodyMode('base');d.setOutfit(0);d.setSpeed(.85);d.setPlaybackRate(1);d.view(view);d.advance(.5);d.walkTo(-.5,2.8);for(let i=0;i<300&&d.snapshot().distance<.65;i++)d.advance(1/120);
   let cap=document.querySelector('#turn-caption');if(!cap){cap=document.createElement('div');cap.id='turn-caption';cap.style='position:fixed;bottom:20px;left:40px;background:#fff;padding:14px 24px;border-radius:10px;z-index:999;font:18px sans-serif';document.body.append(cap)}cap.textContent='180° 返向 · '+view+' · .85m/s · 同相位起始 · 候选 '+d.buildInfo.shortId;
  },view);
  await page.waitForTimeout(450);out.push(await page.evaluate(()=>{const s=__debug.snapshot();__debug.walkTo(-.5,.4);__debug.setPaused(false);return {start:s.position,phase:s.phase,build:s.buildInfo,view:s.view}}));
  await page.waitForFunction(()=>!__debug.snapshot().target&&__debug.snapshot().mode==='idle',{},{timeout:18000});await page.waitForTimeout(900);await page.evaluate(()=>__debug.setPaused(true));
 }
 return out;
}

