const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {verifyCandidate}=require('./qa-m1-common.cjs');
const [url,build,dir,indexPath]=process.argv.slice(2);
(async()=>{
 const index=JSON.parse(await fs.readFile(indexPath,'utf8')),out=path.resolve(dir);await fs.mkdir(out,{recursive:false});
 await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true}),report={build,cases:[],scope:'Cold loading and exact identity only; not motion or visual acceptance'};
 try{for(const preset of index.presets){const context=await browser.newContext({viewport:{width:1440,height:900}}),p=await context.newPage();
  const r={id:preset.id,errors:[]},start=Date.now();p.on('pageerror',e=>r.errors.push(String(e)));
  try{await p.goto(url+'?workbench=appearance&body='+preset.id);await p.waitForFunction(()=>__debug?.ready,null,{timeout:20000});
   r.identity=await verifyCandidate(p,{build,assetId:preset.profile.id,sha256:preset.profile.sha256});
   r.runtime=await p.evaluate(()=>({profile:__debug.avatar().profile,live:__debug.avatar().livePresentation.getState(),appearance:__debug.avatar().appearance.getState()}));
   assert.equal(r.runtime.profile.bodyType,preset.id);assert(r.runtime.live.eyeBlinkCompatibility.available);
   await p.selectOption('#appearance-eye-color','green');await p.waitForFunction(()=>document.querySelector('#appearance-form').getAttribute('aria-busy')==='false');
   assert.equal(await p.evaluate(()=>__debug.avatar().appearance.getState().eyeColor),'green');
   await p.screenshot({path:path.join(out,preset.id+'.png')});assert.deepEqual(r.errors,[]);r.status='loaded-exact-palette-passed';
  }catch(e){r.status='failed';r.error=String(e.stack??e);await p.screenshot({path:path.join(out,preset.id+'-failed.png')}).catch(()=>{});}
  finally{r.wallMs=Date.now()-start;report.cases.push(r);await context.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({id:r.id,status:r.status,error:r.error}));}
 }}finally{await browser.close();report.status=report.cases.length===8&&report.cases.every(x=>x.status==='loaded-exact-palette-passed')?'passed':'failed';await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');}
 if(report.status==='failed')process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
