const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const out=path.resolve(__dirname,'../output/playwright/gait-review');await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:false});
 try{for(const clip of process.argv.slice(2).length?process.argv.slice(2):['Walk_Loop','Walk_Formal_Loop']){
  const context=await browser.newContext({viewport:{width:1440,height:960},recordVideo:{dir:out,size:{width:1440,height:960}}}),page=await context.newPage();
  try{
   await page.goto(process.env.QA_URL||'http://127.0.0.1:5173');await page.waitForFunction(()=>window.__debug?.ready);
   await page.evaluate(async({text,clip})=>{const m=await import(URL.createObjectURL(new Blob([text],{type:'text/javascript'})));await m.startGaitReview(clip);},{text:await fs.readFile(path.join(__dirname,'gait-review-browser.mjs'),'utf8'),clip});
   const results=[];
   for(const view of ['front','side'])for(const rate of [1,.25]){
    const promise=page.evaluate(({view,rate})=>window.__gaitReview.run(view,rate,3),{view,rate});
    for(let i=0;i<8;i++){await page.waitForTimeout(rate===1?450:1400);await page.screenshot({path:path.join(out,`${clip}-${view}-${rate}-${i}.png`)});}
    results.push(await promise);
   }
   await fs.writeFile(path.join(out,clip+'.json'),JSON.stringify(results,null,2));
   console.log(clip+' review captured');
  }finally{const video=page.video();await context.close();await video.saveAs(path.join(out,clip+'.webm'));}
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
