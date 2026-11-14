async(page)=>{
 const trace=[];
 for(const view of ['front','side']){
  await page.evaluate(view=>{__debug.setPaused(true);__debug.reset();__debug.setBodyMode('base');__debug.setOutfit(0);__debug.view(view);__debug.setChairTransform({x:1.1,z:.2,yaw:Math.PI/4});__debug.setPaused(false);document.querySelector('#record-caption').textContent='中断验证 / '+view+' / 基础动作 · 候选 '+__debug.buildInfo.shortId;__debug.walkTo(1.7,2);},view);
  await page.waitForTimeout(900);await page.evaluate(()=>__debug.walkTo(-1.8,2));await page.waitForTimeout(650);await page.evaluate(()=>__debug.action('idle'));await page.waitForTimeout(900);
  await page.evaluate(()=>__debug.action('dance'));await page.waitForTimeout(1000);await page.evaluate(()=>__debug.walkTo(-.2,1.7));await page.waitForTimeout(1800);
  await page.evaluate(()=>__debug.action('sit'));await page.waitForFunction(()=>__debug.snapshot().mode==='sit'&&__debug.snapshot().motion.sitProgress>.35,{},{timeout:20000});
  trace.push(await page.evaluate(()=>{const b=__debug.snapshot();__debug.walkTo(-.8,2);return{before:b,request:__debug.snapshot()}}));await page.waitForFunction(()=>__debug.snapshot().mode==='walk');await page.waitForTimeout(1500);await page.evaluate(()=>__debug.action('idle'));await page.waitForTimeout(800);
 }
 await page.evaluate(()=>__debug.setPaused(true));return trace;
}
