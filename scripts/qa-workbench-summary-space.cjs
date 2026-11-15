// Explicit fixed-build reproduction. Never overwrite archived failure evidence.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path');
const build=process.env.QA_BUILD,base=process.env.QA_URL||'http://127.0.0.1:4196/';
if(!/^[a-f0-9]{12}$/.test(build||''))throw Error('Set QA_BUILD to the explicit fixed build');
(async()=>{
 const out=path.resolve('evidence/workbench-summary-space-'+build);
 await fs.mkdir(out); // exclusive directory: preserve previous evidence
 await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const b=await chromium.launch({channel:'chrome',headless:true});
 try{
  const p=await b.newPage({viewport:{width:1600,height:1000}});
  await p.goto(new URL('?workbench=appearance',base).href);await p.waitForFunction(()=>window.__debug?.ready);
  const state=()=>p.evaluate(()=>({build:__debug.buildInfo.shortId,paused:__debug.snapshot().paused,open:document.querySelector('#appearance-geometry').open}));
  const before=await state();if(before.build!==build)throw Error('Wrong served build');
  if(typeof before.paused!=='boolean')throw Error('Missing pause state');
  await p.locator('#appearance-geometry summary').focus();await p.keyboard.press('Space');await p.waitForTimeout(80);
  const after=await state();const result={before,after,expected:'Summary Space expands details without pausing character',passed:after.open!==before.open&&after.paused===before.paused};
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(result,null,2));console.log(result);
  if(!result.passed)process.exitCode=1;
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
