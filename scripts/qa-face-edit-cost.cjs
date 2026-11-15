// No screenshots or recording during the measured edit windows.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const build=process.env.QA_BUILD,url=process.env.QA_URL||'http://127.0.0.1:4277/';
if(!/^[a-f0-9]{12}$/.test(build||''))throw Error('QA_BUILD required');
(async()=>{
 const out=path.resolve('evidence/face-geometry-cost-'+build);await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{for(const body of ['female','male']){
  const target=path.join(out,body+'.json');try{await fs.access(target);throw Error('Refuse overwrite');}catch(e){if(e.code!=='ENOENT')throw e;}
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(url+'?workbench=appearance&body='+body);await page.waitForFunction(()=>__debug.ready);assert.equal(await page.evaluate(()=>__debug.buildInfo.shortId),build);await page.waitForTimeout(1200);
  await page.evaluate(()=>{window.cost={frames:[],events:[]};let last=performance.now();function f(t){cost.frames.push({t,dt:t-last});last=t;cost.raf=requestAnimationFrame(f);}cost.raf=requestAnimationFrame(f);});
  for(const value of [-.04,.04,0,.02]){
   const result=await page.evaluate(async value=>{const start=performance.now(),r=await __debug.command({type:'faceGeometry',mouthWidth:value}),end=performance.now();cost.events.push({value,start,end,elapsed:end-start,r});return r;},value);assert(result.applied,JSON.stringify(result));await page.waitForTimeout(1500);
  }
  const data=await page.evaluate(()=>{cancelAnimationFrame(cost.raf);return{...cost,build:__debug.buildInfo.shortId,state:__debug.avatar().facialGeometry.getState(),render:__debug.renderer.info.memory};});
  data.body=body;data.errors=errors;data.browser=browser.version();data.scope='Development-machine headless, no screenshots/recording; edit wait includes asynchronous render preparation, not a CPU-only timing.';
  for(const e of data.events){const frames=data.frames.filter(f=>f.t>=e.start-20&&f.t<=e.end+1500);e.maxFrame=Math.max(...frames.map(f=>f.dt));e.framesOver33=frames.filter(f=>f.dt>33).length;}
  await fs.writeFile(target,JSON.stringify(data,null,2));console.log(body,data.events.map(e=>({value:e.value,waitMs:e.elapsed,maxFrame:e.maxFrame,framesOver33:e.framesOver33})));await page.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
