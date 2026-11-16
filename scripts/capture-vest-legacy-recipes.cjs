const fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('../prototype/node_modules/playwright');
const {verifyCandidate}=require('./qa-m1-common.cjs');
(async()=>{
 const [url,build,destination]=process.argv.slice(2),out=path.resolve(destination);await fs.mkdir(out,{recursive:false});
 const index=JSON.parse(await fs.readFile('prototype/public/assets/m2-representative-batch-v2/runtime-index.json'));
 const cases=[{id:'female',profile:{id:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'}},...['female-round-full-v2','female-soft-wide-v2'].map(id=>index.presets.find(x=>x.id===id))];
 const browser=await chromium.launch({channel:'chrome',headless:true}),report={build,cases:[],status:'running'};
 try{for(const spec of cases){const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();try{await page.goto(url+'?workbench=appearance&body='+spec.id);await page.waitForFunction(()=>window.__debug?.ready&&document.querySelector('#appearance-form')?.getAttribute('aria-busy')==='false',null,{timeout:60000});const identity=await verifyCandidate(page,{build,assetId:spec.profile.id,sha256:spec.profile.sha256});const text=await page.evaluate(()=>__debug.exportAppearanceRecipe());await fs.writeFile(path.join(out,spec.id+'.json'),text);report.cases.push({id:spec.id,identity,file:spec.id+'.json'});}finally{await context.close();}}report.status='captured';}finally{await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}console.log(JSON.stringify({status:report.status,cases:report.cases.length}));
})().catch(e=>{console.error(e);process.exitCode=1;});
