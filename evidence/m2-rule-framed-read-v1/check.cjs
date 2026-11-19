const fs=require('node:fs/promises'),{createReadStream}=require('node:fs');
const http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const {createGzip}=require('node:zlib'),{Readable}=require('node:stream');
const {pipeline}=require('node:stream/promises'),{createHash}=require('node:crypto');
const {projectOutput,productionRoot}=require('../../scripts/project-output.cjs');
const {launchQABrowser}=require('../../scripts/qa-browser-workspace.cjs');
const {observeNetwork}=require('../../scripts/qa-cold-assets.cjs');
const sha=b=>createHash('sha256').update(b).digest('hex');
const scenarios=['normal','header-large','truncated','wire-short','chunked','chunked-over','gzip','gzip-over',
  'wrong-sha','abort-before','abort-headers','abort-mid','abort-blob','abort-after-digest','redirect','http503','synthetic','controlled'];

async function inputs(folder,pin,id){
  const {localFile,checkedBytes}=await import('../../scripts/runtime-package/files.mjs');
  const raw=await fs.readFile(await localFile(folder,'runtime-package.json'));assert.equal(sha(raw),pin);
  const inv=JSON.parse(raw),files=new Map(inv.files.map(f=>[f.path,f]));
  const manifest=JSON.parse(await checkedBytes(folder,files.get('records/manifest.json')));
  const entry=manifest.entries.find(e=>e.id===id);assert(entry);
  const record=JSON.parse(await checkedBytes(folder,files.get(entry.url.slice(1))));
  const {validateCharacterRecord}=await import('../../prototype/src/character-record.js');
  assert.equal((await validateCharacterRecord(record,{validationCallback:()=>({status:'pending'})})).recordSha256,entry.recordSha256);
  const body=record.appearanceRecipe.base,shoe=record.appearanceRecipe.equipment.resources.shoes;
  assert(manifest.ruleBodyDataPacks.some(p=>p.bodyType===body.bodyType));assert.equal(shoe.compatibleAvatarSha256,body.sha256);
  const assets=[];
  for(const [kind,url,digest,limit] of [['body','/assets/'+body.bodyType+'/body.vrm',body.sha256,32*1024*1024],
    ['shoe',shoe.url,shoe.sha256,1024*1024]]){
    const f=files.get(url.slice(1));assert.equal(f.sha256,digest);assert(f.bytes>4096&&f.bytes<=limit);
    assets.push({kind,url,sha256:digest,bytes:f.bytes,limit,file:await localFile(folder,f.path),data:await checkedBytes(folder,f)});
  }
  return {assets,record:entry.recordSha256,runtime:inv.runtime};
}

function serverFor(assets,moduleBytes){
  return http.createServer((req,res)=>{
    const u=new URL(req.url,'http://localhost');
    if(u.pathname==='/'){
      res.setHeader('Content-Type','text/html; charset=utf-8');
      return res.end('<title>Framing</title><script type="module" src="/attempt.mjs"></script>');
    }
    if(u.pathname==='/attempt.mjs'){
      res.setHeader('Content-Type','text/javascript');
      return res.end('globalThis.framedAttempt='+attempt.toString());
    }
    if(u.pathname==='/read.mjs'){res.setHeader('Content-Type','text/javascript');return res.end(moduleBytes);}
    const a=assets.find(x=>x.url===u.pathname),s=u.searchParams.get('case')??'normal';
    if(!a||!scenarios.includes(s)){res.writeHead(404);return res.end();}
    const h={'Content-Type':'model/gltf-binary','Cache-Control':'no-store'};
    if(s==='redirect'){res.writeHead(302,{...h,Location:'/'});return res.end();}
    if(s==='http503'){res.writeHead(503,{...h,'Content-Length':0});return res.end();}
    if(s.startsWith('gzip'))h['Content-Encoding']='gzip';
    if(!s.startsWith('gzip')&&!s.startsWith('chunked'))
      h['Content-Length']=a.bytes+(s==='header-large'?1:s==='truncated'?-1:0);
    res.writeHead(200,h);
    if(s==='abort-mid'||s==='abort-headers'){
      res.flushHeaders();res.write(a.data.subarray(0,4096));
      const timer=setTimeout(()=>res.destroy(),5000);res.once('close',()=>clearTimeout(timer));return;
    }
    if(s==='wire-short'){
      // Deterministically end the transport before the advertised last byte.
      return res.write(a.data.subarray(0,-1),()=>res.socket?.end());
    }
    if(s==='header-large'||s==='chunked-over'){res.write(a.data);return res.end(Buffer.from([0]));}
    if(s==='wrong-sha'){res.write(Buffer.from([a.data[0]^1]));return res.end(a.data.subarray(1));}
    if(s.startsWith('gzip')){
      const chunks=s==='gzip-over'?[a.data,Buffer.from([0])]:[a.data];
      pipeline(Readable.from(chunks),createGzip(),res).catch(()=>res.destroy());return;
    }
    pipeline(createReadStream(a.file,{end:a.bytes-(s==='truncated'?2:1)}),res).catch(()=>res.destroy());
  });
}

// Exactly the same application function is exercised by Node and CfT.
async function attempt({moduleUrl,url,origin,pin,mode,s}){
  const {readPinned}=await import(moduleUrl);
  const c=new AbortController(),row={accepted:0,abortAt:null,http:null,path:null,sha256:null,blobSize:null};
  const abort=stage=>{row.abortAt=stage;c.abort();};
  function observe(stage,value){
    if(stage==='chunk')row.accepted=value;
    if(stage==='path')row.path=value;
    if(stage==='http')row.http=value;
    if(stage==='digest')row.sha256=value;
    if(stage==='verifiedBlobSize')row.blobSize=value;
    if((stage==='chunk'&&s==='abort-mid')||(stage==='http'&&s==='abort-headers')||
      (stage==='verifiedBlobSize'&&s==='abort-blob')||(stage==='digest'&&s==='abort-after-digest'))abort(stage);
  }
  const options={mode,signal:c.signal,origin,observe};
  if(s==='synthetic')options.fetcher=async (...args)=>{
    const r=await fetch(...args);return new Response(r.body,{headers:r.headers});
  };
  if(s==='controlled')options.controlled=()=>true;
  if(s==='abort-before')abort('before-fetch');
  try{row.bytes=await readPinned(url,pin,options);row.outcome='ok';}
  catch(error){row.outcome=error.diagnostic??(c.signal.aborted&&error.name==='AbortError'?'abort':'network');row.error=error.message;}
  return row;
}

function appIssues(row,pin,mode,s){
  const expected=({normal:'ok','header-large':mode==='candidate'?'declared-overflow':'overflow',truncated:'truncated',
    'wire-short':'network',chunked:'ok','chunked-over':'overflow',gzip:'ok','gzip-over':'overflow','wrong-sha':'wrong-sha',
    redirect:'network',http503:'http',synthetic:'ok',controlled:'ok','abort-blob':mode==='candidate'?'abort':'ok'})[s]??'abort';
  const issues=[];
  if(row.outcome!==expected)issues.push('expected '+expected+', got '+row.outcome);
  if(row.accepted>pin.bytes)issues.push('accepted more than the pin');
  if(row.http!==(['abort-before','redirect'].includes(s)?null:s==='http503'?503:200))issues.push('unexpected HTTP status');
  if(s==='wrong-sha'&&(!row.sha256||row.sha256===pin.sha256))issues.push('corrupt digest missing');
  if(s==='abort-blob'&&mode==='candidate'&&(row.abortAt!=='verifiedBlobSize'||row.blobSize!==pin.bytes))issues.push('Blob abort window missed');
  if(expected==='ok'&&(row.bytes!==pin.bytes||row.sha256!==pin.sha256))issues.push('application digest or length mismatch');
  if(row.blobSize!==null&&row.blobSize!==pin.bytes)issues.push('wrong checked Blob.size');
  if(s==='header-large'&&mode==='candidate'&&(row.path!=='reject-header'||row.accepted!==0))issues.push('excessive header was consumed');
  if(s==='normal'&&row.path!==(mode==='candidate'?'limited-blob':'reader'))issues.push('normal control selected wrong path');
  if(['truncated','chunked','chunked-over','gzip','gzip-over','synthetic','controlled'].includes(s)&&row.path!=='reader')
    issues.push('fallback missing');
  if(s==='abort-mid'&&(row.accepted===0||row.accepted===pin.bytes))issues.push('mid-stream abort did not interrupt');
  return issues;
}

async function main(){
  const [folder,pin,id,destination,flag]=process.argv.slice(2);
  assert(folder&&/^[a-f0-9]{64}$/.test(pin)&&id&&destination&&(!flag||flag==='--cpu'),'GAME PIN ID NEW_RESULT [--cpu]');
  const root=await productionRoot(),out=await projectOutput(destination,root);
  const {assets,runtime,record}=await inputs(await fs.realpath(folder),pin,id);
  const moduleBytes=await fs.readFile(path.join(__dirname,'read.mjs'));
  const report={folder,pin,id,runtime,record,moduleSha256:sha(moduleBytes),runnerSha256:sha(await fs.readFile(__filename)),
    environment:flag?'CPU':'CfT 145',runs:[],firstFailure:null};
  await fs.mkdir(out);
  const server=serverFor(assets,moduleBytes);
  try{
    await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
    const origin='http://127.0.0.1:'+server.address().port;
    for(const mode of ['reader','candidate']){
      let session,page,network;
      try{
        if(!flag){
          session=await launchQABrowser(out,{browserConfig:path.join(root,'scripts/production/fusion-cft145.json')});
          const context=await session.browser.newContext({serviceWorkers:'block'});
          page=await context.newPage();network=await observeNetwork(context,page);await page.goto(origin+'/');
        }
        for(const {kind,url:pathname,bytes,sha256,limit} of assets)for(const s of scenarios){
          const url=origin+pathname+(s==='normal'?'':'?case='+s);
          const arg={moduleUrl:page?origin+'/read.mjs':require('node:url').pathToFileURL(path.join(__dirname,'read.mjs')).href,
            url,origin,pin:{bytes,sha256,limit},mode,s};
          const app=page?await page.evaluate(args=>globalThis.framedAttempt(args),arg):await attempt(arg);
          const issues=appIssues(app,arg.pin,mode,s);
          let cdp;
          if(network){
            const terminal=()=>network.diagnostics([url]).requestLifecycle.filter(c=>c.events.some(e=>e.url===url&&e.event==='request'));
            const end=Date.now()+1600;
            while(s!=='abort-before'&&Date.now()<end&&!terminal().some(c=>c.events.some(e=>['finish','fail'].includes(e.event))))
              await new Promise(resolve=>setTimeout(resolve,25));
            const attempts=await network.readAttempts(url);
            cdp={events:terminal(),attempts:attempts.map(a=>({id:a.requestId,error:a.error,transferBytes:a.transferBytes,
              bytes:a.bytes?.length,sha256:a.bytes&&sha(a.bytes)}))};
            if(s==='normal'&&(attempts.length!==1||cdp.attempts[0].sha256!==sha256||!(cdp.attempts[0].transferBytes>=bytes)))
              issues.push('CDP normal-body verification unavailable or mismatched');
          }
          const row={mode,asset:kind,case:s,pin:arg.pin,app,cdp,issues,browser:session?.receipt};
          report.runs.push(row);
          if(issues.length&&!report.firstFailure)report.firstFailure={mode,asset:kind,case:s,issues};
          await fs.appendFile(path.join(out,'attempts.jsonl'),JSON.stringify(row)+'\n');
        }
      }finally{await session?.close();}
    }
  }catch(error){report.fatal=error.stack;throw error;}
  finally{
    server.closeAllConnections();
    if(server.listening)await new Promise(resolve=>server.close(resolve));
    await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  }
  console.log(JSON.stringify({rows:report.runs.length,firstFailure:report.firstFailure}));
  if(report.firstFailure)process.exitCode=2;
}
main().catch(error=>{console.error(error);process.exitCode=1;});
