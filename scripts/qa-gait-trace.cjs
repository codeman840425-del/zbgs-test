const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const out=path.resolve(__dirname,'../output/playwright/gait-trace');await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:false}),context=await browser.newContext({viewport:{width:1440,height:960},recordVideo:{dir:out,size:{width:1440,height:960}}}),page=await context.newPage();
 try{
  await page.goto(process.env.QA_URL||'http://127.0.0.1:5183');await page.waitForFunction(()=>window.__debug?.ready);
  await page.evaluate(async text=>{const m=await import(URL.createObjectURL(new Blob([text],{type:'text/javascript'})));await m.startGaitReview('Walk_Loop');},await fs.readFile(path.join(__dirname,'gait-review-browser.mjs'),'utf8'));
  for(const moveRoot of [false,true])for(const [label,footIK,pelvis]of [['raw',false,false],['IK',true,false],['pelvis',false,true],['full',true,true]]){
   const r=await page.evaluate(({moveRoot,label,footIK,pelvis})=>window.__gaitReview.run('side',1,3,{moveRoot,label,corrections:{footIK,pelvis},allFrames:true}),{moveRoot,label,footIK,pelvis});
   await fs.writeFile(path.join(out,`${moveRoot?'path':'in-place'}-${label}.json`),JSON.stringify(r,null,2));
   console.log(`${moveRoot?'path':'in-place'}-${label}: ${r.records.length} frames`);
  }
 }finally{const video=page.video();await context.close();await video.saveAs(path.join(out,'correction-matrix.webm'));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
