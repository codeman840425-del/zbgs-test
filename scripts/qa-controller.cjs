const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage();
 const out=path.resolve('output/playwright/controller-final');await fs.mkdir(out,{recursive:true});
 try{
  await page.goto(process.argv[2]||'http://127.0.0.1:4180/');await page.waitForFunction(()=>__debug?.ready);
  for(const name of ['controller-check','scene-lifecycle-check','chair-local-contact-check']){
   const source=await fs.readFile(path.join(__dirname,name+'.generated.js'),'utf8');
   const run=Function('return ('+source+')')();const result=await run(page);
   await fs.writeFile(path.join(out,name+'.json'),JSON.stringify({buildInfo:await page.evaluate(()=>__debug.buildInfo),result},null,2));
   console.log(name+' completed');
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
