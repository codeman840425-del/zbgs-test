const fs=require('node:fs/promises'),path=require('node:path');
const {chromium}=require('../prototype/node_modules/playwright');
const {verifyCandidate}=require('./qa-m1-common.cjs');
(async()=>{
 const out=path.resolve('evidence/background-aa6fc6159e2d-v1/network-source');await fs.mkdir(out);await fs.copyFile(__filename,path.join(out,'executed-script.cjs'));await fs.writeFile(path.join(out,'.gitignore'),'/chrome-profile/\n');
 const r={build:'aa6fc6159e2d',url:'http://127.0.0.1:4196/?body=female',requests:[],badResponses:[],requestFailed:[],console:[],pageErrors:[],cdpBadResponses:[]};let c;
 try{
  c=await chromium.launchPersistentContext(path.join(out,'chrome-profile'),{channel:'chrome',headless:false,viewport:{width:1440,height:900}});const p=c.pages()[0];
  p.on('request',q=>r.requests.push({url:q.url(),method:q.method(),type:q.resourceType()}));p.on('response',q=>{if(q.status()>=400)r.badResponses.push({url:q.url(),status:q.status(),type:q.request().resourceType()})});p.on('requestfailed',q=>r.requestFailed.push({url:q.url(),type:q.resourceType(),failure:q.failure()}));p.on('console',m=>r.console.push({type:m.type(),text:m.text(),location:m.location()}));p.on('pageerror',e=>r.pageErrors.push(String(e)));
  const s=await c.newCDPSession(p);await s.send('Network.enable');s.on('Network.responseReceived',e=>{if(e.response.status>=400)r.cdpBadResponses.push({url:e.response.url,status:e.response.status,type:e.type,mimeType:e.response.mimeType,requestId:e.requestId})});
  await p.goto(r.url);await p.waitForFunction(()=>window.__debug?.ready,null,{timeout:60000});r.identity=await verifyCandidate(p,{build:r.build,assetId:'beta-base-female-m1',sha256:'027bed60dd7ae1b77d3dbaeabe682d69b09ea39dc36151d862a5e0c58bcd5b95'});await p.waitForTimeout(600);await p.screenshot({path:path.join(out,'ready.png')});r.ready=await p.evaluate(()=>({ready:__debug.ready,visibility:document.visibilityState}));r.status='observed';
 }catch(e){r.failure=String(e);process.exitCode=1}finally{if(c)await c.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(r,null,2));console.log(JSON.stringify({out,badResponses:r.badResponses,cdpBadResponses:r.cdpBadResponses,requestFailed:r.requestFailed,console:r.console.filter(x=>x.type==='error'),failure:r.failure}))}
})().catch(e=>{console.error(e);process.exitCode=1});
