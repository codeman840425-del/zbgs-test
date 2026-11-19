const {chromium}=require('../../prototype/node_modules/playwright');
const {createHash}=require('node:crypto');
const fs=require('node:fs/promises'),path=require('node:path');
const [base]=process.argv.slice(2);
(async()=>{
 const file='/assets/motion/UAL1_Standard.glb';
 const expected=await fs.readFile(path.resolve('prototype/public','.'+file)), hash=createHash('sha256').update(expected).digest('hex');
 const runs=[];
 for(const spec of [{name:'cft145',executablePath:chromium.executablePath()},{name:'chrome',channel:'chrome'}]){
  const {name,...opts}=spec;
  const browser=await chromium.launch({...opts,headless:true});
  try{
   for(const mode of ['stream','arrayBuffer']){
    const ctx=await browser.newContext(); const page=await ctx.newPage();await page.goto(base+'build-info.json');
    const cdp=await ctx.newCDPSession(page);await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled',{cacheDisabled:true});
    const rows=[];
    const events=['requestWillBeSent','responseReceived','loadingFinished','loadingFailed'];
    for(const event of events)cdp.on('Network.'+event,e=>rows.push({event,id:e.requestId,time:e.timestamp,url:e.request?.url??e.response?.url,status:e.response?.status,text:e.errorText,length:e.encodedDataLength,canceled:e.canceled}));
    const actual=await page.evaluate(async({file,mode})=>{
     let r=await fetch(file);
     if(mode==='stream'){
      const reader=r.body.getReader();
      r=new Response(new ReadableStream({start(controller){function read(){reader.read().then(({done,value})=>{if(done){controller.close();return;} controller.enqueue(value);read();},e=>controller.error(e));}read();}}));
     }
     const b=await r.arrayBuffer();
     const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
     return {size:b.byteLength,sha};
    },{file,mode});
    const id=rows.find(e=>e.url?.endsWith(file))?.id;
    await page.waitForTimeout(250);
    runs.push({browser:name,version:browser.version(),mode,actual,byteMatch:actual.size===expected.length&&actual.sha===hash,events:rows.filter(e=>e.id===id)});
    await ctx.close();
   }
  }finally{await browser.close();}
 }
 await fs.writeFile(path.join(__dirname,'report.json'),JSON.stringify({referenceSha256:hash,runs},null,2));
 console.log(runs.map(r=>[r.browser,r.mode,r.byteMatch,r.events.map(e=>e.event+':'+(e.text??'')).join(',')]));
})().catch(e=>{console.error(e);process.exitCode=1});
