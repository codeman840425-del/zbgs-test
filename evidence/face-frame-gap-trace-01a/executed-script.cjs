// One bounded diagnostic trace; tracing overhead means this is not a benchmark.
const {chromium}=require('../prototype/node_modules/playwright');
const fs=require('node:fs/promises'),path=require('node:path'),zlib=require('node:zlib'),assert=require('node:assert/strict');
const [base,build,dir]=process.argv.slice(2),out=path.resolve(dir);
(async()=>{
 await fs.mkdir(out);await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base+'?workbench=appearance&body=male');
  await page.waitForFunction(()=>window.__debug?.ready&&!document.querySelector('#appearance-identity-fields').disabled);
  assert.equal(await page.evaluate(()=>__debug.buildInfo.shortId),build);
  await page.evaluate(()=>__debug.command({type:'pause',value:true}));await page.waitForTimeout(250);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Tracing.start',{categories:'devtools.timeline,blink.user_timing,gpu,cc',transferMode:'ReturnAsStream'});
  await page.evaluate(()=>{
   const q=window.__gap={frames:[],heartbeats:[],longframes:[],supported:PerformanceObserver.supportedEntryTypes,record:true,observers:[]};
   let prev=null;function frame(t){if(!q.record)return;const now=performance.now();q.frames.push({t,now,dt:prev===null?null:t-prev});prev=t;requestAnimationFrame(frame);}requestAnimationFrame(frame);
   let previous=performance.now();q.timer=setInterval(()=>{const now=performance.now();q.heartbeats.push({now,dt:now-previous});previous=now;},10);
   for(const type of ['long-animation-frame','longtask'])if(q.supported.includes(type)){const o=new PerformanceObserver(list=>q.longframes.push(...list.getEntries().map(e=>e.toJSON())));o.observe({type,buffered:false});q.observers.push(o);}
  });
  const result=await page.evaluate(async()=>{performance.mark('face-diagnostic-start');const result=await __debug.command({type:'faceGeometry',mouthWidth:.04});performance.mark('face-diagnostic-resolved');return result;});
  assert.equal(result.applied,true);await page.waitForTimeout(600);
  const data=await page.evaluate(()=>{const q=__gap;q.record=false;clearInterval(q.timer);q.observers.forEach(o=>o.disconnect());const{observers,timer,...data}=q;return{...data,marks:performance.getEntriesByType('mark').filter(e=>e.name.startsWith('face-diagnostic')).map(e=>e.toJSON())};});
  const completed=new Promise(resolve=>cdp.once('Tracing.tracingComplete',resolve));await cdp.send('Tracing.end');const {stream}=await completed;
  const buffers=[];for(;;){const chunk=await cdp.send('IO.read',{handle:stream});buffers.push(Buffer.from(chunk.data,chunk.base64Encoded?'base64':'utf8'));if(chunk.eof)break;}await cdp.send('IO.close',{handle:stream});
  const trace=Buffer.concat(buffers);await fs.writeFile(path.join(out,'trace.json.gz'),zlib.gzipSync(trace));
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify({build,result,errors,scope:'One paused male first edit, diagnostic tracing enabled. Not performance acceptance. No tab clicks/video.',...data},null,2));
  console.log(JSON.stringify({out,traceBytes:trace.length,errors}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
