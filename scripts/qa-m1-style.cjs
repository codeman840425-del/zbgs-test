const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const expected=process.env.QA_BUILD;if(!expected)throw Error('QA_BUILD required');
 const out=path.resolve('output/playwright/m1',expected,'style');await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},recordVideo:{dir:out,size:{width:1440,height:1000}}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(process.argv[2]||'http://127.0.0.1:4191/');await page.waitForFunction(()=>window.__debug?.ready);
  if(await page.evaluate(()=>__debug.buildInfo.shortId)!==expected)throw Error('Wrong build');
  await page.evaluate(()=>{__debug.reset();__debug.setPaused(true);__debug.setBodyMode('dressed');});
  for(const outfit of [0,1])for(const view of ['front','side','back']){
   await page.evaluate(({outfit,view})=>{__debug.setOutfit(outfit);__debug.view(view);__debug.advance(1/60);},{outfit,view});
   await page.screenshot({path:path.join(out,`${outfit?'skirt':'pants'}-${view}.png`)});
  }
  await page.evaluate(()=>{
   const d=__debug,a=d.avatar();d.view('free');d.setOutfit(0);const render=d.renderer.render;
   d.renderer.render=function(scene,camera){const p=a.vrm.humanoid.getRawBoneNode('head').getWorldPosition(a.root.position.clone());camera.position.set(p.x+.15,p.y+.08,p.z+.8);camera.lookAt(p.x,p.y+.06,p.z);return render.call(this,scene,camera);};
   d.setPaused(false);
  });
  await page.waitForTimeout(3800);
  for(const face of ['neutral','happy','aa']){
   await page.evaluate(face=>__debug.avatar().setExpression(face),face);await page.waitForTimeout(600);
   await page.screenshot({path:path.join(out,`face-${face}.png`)});
  }
  const report=await page.evaluate(()=>({build:__debug.buildInfo,asset:__debug.avatar().profile,expressions:__debug.avatar().vrm.expressionManager.expressions.map(e=>({name:e.expressionName,weight:e.weight})),outfit:__debug.avatar().getOutfitInfo()}));
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify({...report,errors,browser:browser.version()},null,2));
 }finally{const v=page.video();await context.close();await v.saveAs(path.join(out,'style-and-face.webm'));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
