async(page)=>{
 const traces=[];const stages=[
 {view:'front',chair:{x:2.65,z:.8732500623203105,yaw:0},label:'原位座椅 / 正面 / 完整裙装'},
 {view:'side',chair:{x:2.65,z:.8732500623203105,yaw:0},label:'原位座椅 / 侧面 / 完整裙装'},
 {view:'front',chair:{x:1.1,z:.2,yaw:Math.PI/4},label:'移动 + 45° 座椅 / 正面 / 完整裙装'},
 {view:'side',chair:{x:1.1,z:.2,yaw:Math.PI/4},label:'移动 + 45° 座椅 / 侧面 / 完整裙装'}];
 for(const [i,s] of stages.entries()){
  await page.evaluate(s=>{__debug.setPaused(true);__debug.reset();__debug.setChairTransform(s.chair);__debug.view(s.view);__debug.setOutfit(1);__debug.setBodyMode('dressed');__debug.setPlaybackRate(1);let cap=document.querySelector('#record-caption');if(!cap){cap=document.createElement('div');cap.id='record-caption';cap.style='position:fixed;bottom:20px;left:40px;background:#fff;padding:14px 24px;border-radius:10px;z-index:999;font:18px sans-serif';document.body.append(cap)}cap.textContent=s.label+' · 候选 '+__debug.buildInfo.shortId;__debug.setPaused(false);__debug.action('sit');},s);
  await page.waitForFunction(()=>__debug.snapshot().mode==='sit'&&__debug.snapshot().motion.sitProgress>.999,{},{timeout:18000});
  await page.waitForTimeout(650);await page.screenshot({path:'output/playwright/controller/seated-'+i+'.png'});
  traces.push(await page.evaluate(()=>__debug.snapshot()));await page.evaluate(()=>__debug.action('stand'));
  await page.waitForFunction(()=>__debug.snapshot().mode==='idle');await page.waitForTimeout(450);
 }
 await page.evaluate(()=>{__debug.setPaused(true);document.querySelector('#record-caption').textContent='四组完整坐起结束 · 候选 '+__debug.buildInfo.shortId});
 return traces.map(s=>({build:s.buildInfo,chair:s.chair,position:s.position,view:s.view,mode:s.mode,progress:s.motion.sitProgress}));
}
