const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const {createReadStream} = require('node:fs');
const {createHash} = require('node:crypto');
const http = require('node:http');
const path = require('node:path');
const {pipeline} = require('node:stream/promises');
const {observeNetwork} = require('../../scripts/qa-cold-assets.cjs');
const {launchQABrowser} = require('../../scripts/qa-browser-workspace.cjs');
const {productionRoot,projectOutput} = require('../../scripts/project-output.cjs');
const hash = data => createHash('sha256').update(data).digest('hex');
const cases = ['normal','truncated','overflow','wrong-sha','abort','http503'];

// Passed unmodified to page.evaluate; the CPU smoke uses the same function.
async function boundedRead({url,mode,expected,scenario}) {
  const controller = new AbortController();
  const row = {http:null,copied:0,received:0,chunks:0,explicitAbort:false,readerCancel:false,sha256:null};
  function reject(code){throw Object.assign(new Error(code),{diagnosticCode:code});}
  try {
    if(!Number.isSafeInteger(expected.bytes)||expected.bytes<1||expected.bytes>expected.limit)reject('invalid-bound');
    const response = await fetch(url,{redirect:'error',credentials:'same-origin',signal:controller.signal});
    row.http=response.status;
    if(!response.ok)reject('http');
    const data=new Uint8Array(expected.bytes);
    function copy(chunk){
      row.received+=chunk.byteLength;
      row.chunks++;
      if(chunk.byteLength>data.length-row.copied)reject('overflow');
      data.set(chunk,row.copied);
      row.copied+=chunk.byteLength;
      if(scenario==='abort'&&!row.explicitAbort){
        row.explicitAbort=true;
        controller.abort();
      }
    }
    if(mode==='reader'){
      const reader=response.body.getReader();
      try {
        for(;;){
          const {done,value}=await reader.read();
          if(done)break;
          try { copy(value); }
          catch(error){
            if(error.diagnosticCode==='overflow'){row.readerCancel=true;await reader.cancel();}
            throw error;
          }
        }
      } finally { reader.releaseLock(); }
    }else if(mode==='pipe'){
      await response.body.pipeTo(new WritableStream({write:copy},{highWaterMark:1}),{signal:controller.signal});
    }else reject('unknown-reader');
    if(row.copied!==expected.bytes)reject('truncated');
    row.sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),
      n=>n.toString(16).padStart(2,'0')).join('');
    if(row.sha256!==expected.sha256)reject('wrong-sha');
    row.result='ok';
  }catch(error){
    row.result=error.diagnosticCode??(controller.signal.aborted&&error.name==='AbortError'?'abort':'unexpected');
    row.error={name:error.name,message:error.message};
  }
  return row;
}

async function samples(game,pin,actor){
  const {checkedBytes,localFile}=await import('../../scripts/runtime-package/files.mjs');
  const raw=await fs.readFile(await localFile(game,'runtime-package.json'));
  assert.equal(hash(raw),pin,'game fingerprint');
  const inventory=JSON.parse(raw);
  const rows=new Map(inventory.files.map(row=>[row.path,row]));
  const manifest=JSON.parse(await checkedBytes(game,rows.get('records/manifest.json')));
  const entry=manifest.entries.find(e=>e.id===actor);
  assert(entry && entry.url==='/records/'+actor+'.json');
  const record=JSON.parse(await checkedBytes(game,rows.get(entry.url.slice(1))));
  const {validateCharacterRecord}=await import('../../prototype/src/character-record.js');
  const valid=await validateCharacterRecord(record,{validationCallback:()=>({status:'pending'})});
  assert.equal(valid.recordSha256,entry.recordSha256);
  const base=record.appearanceRecipe.base,shoe=record.appearanceRecipe.equipment.resources.shoes;
  assert(manifest.ruleBodyDataPacks.some(p=>p.bodyType===base.bodyType));
  assert.equal(shoe.compatibleAvatarSha256,base.sha256);
  const assets=[];
  for(const [kind,url,sha256,limit] of [
    ['body','/assets/'+base.bodyType+'/body.vrm',base.sha256,32*1024*1024],
    ['shoe',shoe.url,shoe.sha256,1024*1024],
  ]){
    const row=rows.get(url.slice(1));
    assert.equal(row.sha256,sha256);
    assert(row.bytes>1 && row.bytes<=limit);
    const data=await checkedBytes(game,row);
    assets.push({kind,url,sha256,bytes:row.bytes,limit,data,file:await localFile(game,row.path)});
  }
  return {assets,sourceDigest:inventory.runtime.sourceDigest,actor,recordSha256:entry.recordSha256};
}

// Use an ordinary file stream for the normal control. Faults change the server's
// bytes; no Playwright interception, service worker or browser-side fake Response.
function fixture(assets){
  const server=http.createServer((req,res)=>{
    const route=new URL(req.url,'http://localhost');
    if(route.pathname==='/'){
      res.writeHead(200,{'Content-Type':'text/html'});return res.end('<title>Stream diagnostic</title>');
    }
    const sample=assets.find(s=>s.url===route.pathname);
    const fault=route.searchParams.get('case')??'normal';
    if(!sample||!cases.includes(fault)){res.writeHead(404);return res.end();}
    const size=sample.bytes+(fault==='overflow'?1:fault==='truncated'?-1:0);
    res.writeHead(fault==='http503'?503:200,{'Cache-Control':'no-store','Content-Type':'model/gltf-binary',
      'Content-Length':fault==='http503'?0:size});
    if(fault==='http503')return res.end();
    if(fault==='abort'){
      res.write(sample.data.subarray(0,Math.min(4096,size-1)));
      const guard=setTimeout(()=>res.destroy(),10000);
      res.on('close',()=>clearTimeout(guard));
      return;
    }
    if(fault==='wrong-sha'){
      res.write(Buffer.from([sample.data[0]^1]));
      return res.end(sample.data.subarray(1));
    }
    if(fault==='overflow'){res.write(sample.data);return res.end(Buffer.from([0]));}
    pipeline(createReadStream(sample.file,{end:size-1}),res).catch(()=>res.destroy());
  });
  return server;
}

function issuesFor(app,expected,scenario){
  const issues=[];
  const expect=(condition,message)=>{if(!condition)issues.push(message);};
  const result=({normal:'ok',truncated:'truncated',overflow:'overflow','wrong-sha':'wrong-sha',abort:'abort',http503:'http'})[scenario];
  expect(app.result===result,'application result expected '+result);
  expect(app.http===(scenario==='http503'?503:200),'HTTP status differs');
  expect(app.copied<=expected.bytes,'accumulator exceeded its declared bound');
  expect(app.explicitAbort===(scenario==='abort'),'explicit application abort differs');
  if(scenario==='normal')expect(app.copied===expected.bytes && app.sha256===expected.sha256,'application body pin differs');
  if(scenario==='truncated')expect(app.copied===expected.bytes-1,'short body length differs');
  if(scenario==='overflow')expect(app.received===expected.bytes+1,'overflow body length differs');
  if(scenario==='wrong-sha')expect(app.copied===expected.bytes && app.sha256===expected.corruptSha,'corrupted body digest differs');
  if(scenario==='abort')expect(app.copied>0 && app.copied<expected.bytes,'abort did not interrupt a partial body');
  return issues;
}

async function cdpAttempt(network,url){
  const deadline=Date.now()+2200;
  let chains;
  do {
    chains=network.diagnostics([url]).requestLifecycle.filter(row=>row.events.some(e=>e.event==='request'&&e.url===url));
    if(chains.some(row=>row.events.some(e=>e.event==='finish'||e.event==='fail')))break;
    await new Promise(resolve=>setTimeout(resolve,25));
  }while(Date.now()<deadline);
  const attempts=await network.readAttempts(url);
  const {bytes,transferBytes,error,kind}=attempts.at(-1)??{};
  return {attempts:attempts.length,chains,bodyBytes:bytes?.length??null,sha256:bytes?hash(bytes):null,
    transferBytes:transferBytes??null,error:error??null,errorKind:kind??null};
}

function cdpIssues(cdp,expected,scenario){
  const errors=[];
  const events=cdp.chains.flatMap(c=>c.events);
  const terminal=events.filter(e=>e.event==='finish'||e.event==='fail');
  const response=events.filter(e=>e.event==='response');
  if(cdp.attempts!==1 || terminal.length!==1)errors.push('CDP request or terminal count differs');
  if(response.length!==1 || response[0].status!==(scenario==='http503'?503:200))errors.push('CDP HTTP status differs');
  if(events.some(e=>e.event==='cache'||e.fromDiskCache||e.fromServiceWorker))errors.push('response served from cache');
  if(['normal','wrong-sha','truncated'].includes(scenario)){
    const sha=scenario==='wrong-sha'?expected.corruptSha:scenario==='truncated'?expected.shortSha:expected.sha256;
    const size=expected.bytes-(scenario==='truncated'?1:0);
    if(terminal[0]?.event!=='finish'||cdp.bodyBytes!==size||cdp.sha256!==sha||!(cdp.transferBytes>=size))
      errors.push('CDP did not independently verify the completed response');
  }else if(scenario==='abort'&&terminal[0]?.event!=='fail'){
    errors.push('held partial response lacks CDP failure on explicit abort');
  }else if(scenario==='http503'&&terminal[0]?.event!=='finish'){
    errors.push('503 response did not finish');
  }
  return errors;
}

async function main(){
  let [game,pin,actor,output,flag]=process.argv.slice(2);
  if(!game||!/^[a-f0-9]{64}$/.test(pin)||!actor||!output||(flag&&flag!=='--cpu'))
    throw Error('Usage: check.cjs GAME GAME_MANIFEST_SHA ACTOR FRESH_PROJECT_RESULT [--cpu]');
  game=await fs.realpath(game);
  const root=await productionRoot(),out=await projectOutput(output,root);
  const inputs=await samples(game,pin,actor);
  await fs.mkdir(out);
  const report={game,pin,actor,recordSha256:inputs.recordSha256,sourceDigest:inputs.sourceDigest,
    execution:flag?'node-cpu':'CfT 145 independent process per mode',runs:[],firstFailure:null};
  const server=fixture(inputs.assets);
  try{
    await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+server.address().port;
    for(const mode of ['reader','pipe']){
      let session;
      try{
        let page,network;
        if(!flag){
          session=await launchQABrowser(out,{browserConfig:path.join(root,'scripts/production/fusion-cft145.json')});
          const ctx=await session.browser.newContext({serviceWorkers:'block'});
          page=await ctx.newPage();
          network=await observeNetwork(ctx,page);
          await page.goto(base+'/');
        }
        for(const asset of inputs.assets){
          const {file,data,...expected}=asset;
          expected.shortSha=hash(data.subarray(0,-1));
          expected.corruptSha=createHash('sha256').update(Buffer.from([data[0]^1])).update(data.subarray(1)).digest('hex');
          for(const scenario of cases){
            const url=base+asset.url+(scenario==='normal'?'':'?case='+scenario);
            const arg={mode,url,expected,scenario};
            const app=page?await page.evaluate(boundedRead,arg):await boundedRead(arg);
            const cdp=network?await cdpAttempt(network,url):null;
            const row={mode,asset:asset.kind,scenario,expected,app,cdp,
              issues:[...issuesFor(app,expected,scenario),...(cdp?cdpIssues(cdp,expected,scenario):[])],
              browser:session?.receipt??null};
            report.runs.push(row);
            if(row.issues.length&&!report.firstFailure)report.firstFailure={mode,asset:asset.kind,scenario,issues:row.issues};
            await fs.appendFile(path.join(out,'attempts.jsonl'),JSON.stringify(row)+'\n');
          }
        }
      }finally{await session?.close();}
    }
  }catch(error){report.fatal=String(error.stack??error);throw error;}
  finally{
    server.closeAllConnections();
    if(server.listening)await new Promise(resolve=>server.close(resolve));
    await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  }
  console.log(JSON.stringify({execution:report.execution,runs:report.runs.length,firstFailure:report.firstFailure}));
  if(report.firstFailure)process.exitCode=2;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
