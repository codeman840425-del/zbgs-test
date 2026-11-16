import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {gunzipSync,brotliDecompressSync,gzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';

const repo=path.resolve('F:/gamemake');
const evidence=path.join(repo,'evidence/m2-http-transport-independent-v1',process.argv[2]??'');
await fs.mkdir(evidence,{recursive:true});
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const transportFile=path.join(repo,'scripts/runtime-transfer-http/transport.mjs');
const prepareFile=path.join(repo,'scripts/runtime-transfer-http/prepare.mjs');
const started=new Date().toISOString();
const snapshot={transport:sha(await fs.readFile(transportFile)),prepare:sha(await fs.readFile(prepareFile))};
const {prepare,createServer}=await import(pathToFileURL(transportFile));
const reuseDerivatives=process.argv.includes('--reuse-derivatives');
const checks=[],failures=[];
const check=(name,ok,details={})=>{const row={name,ok,...details};checks.push(row);if(!ok)failures.push(row);};
const json=x=>JSON.stringify(x,null,2)+'\n';
await fs.writeFile(path.join(evidence,'tested-transport.mjs'),await fs.readFile(transportFile));
await fs.writeFile(path.join(evidence,'tested-prepare.mjs'),await fs.readFile(prepareFile));
async function request(server,url,headers={},method='GET'){
  return await new Promise((resolve,reject)=>{
    const req=http.request({host:'127.0.0.1',port:server.address().port,path:url,method,headers},res=>{
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));res.on('error',reject);
    });req.on('error',reject);req.end();
  });
}
async function listen(server){await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});}
async function close(server){await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
async function expectReject(name,fn){let error;try{await fn();}catch(e){error={message:e.message,code:e.code??null};}check(name,Boolean(error),{error});return error;}
const packages={};
for(const sex of ['male','female']){
  const root=path.join(repo,`experiments/m2-runtime-transfer-801/${sex}-final-package`);
  const out=path.join(evidence,`${sex}-derivatives`);
  const manifestBytes=await fs.readFile(path.join(root,'runtime-package.json'));
  const manifest=JSON.parse(manifestBytes);
  let report;
  if(reuseDerivatives){
    const previous=path.join(repo,`evidence/m2-http-transport-independent-v1/${sex}-derivatives`);
    await fs.cp(previous,out,{recursive:true});
    report=JSON.parse(await fs.readFile(path.join(out,'http-coding.json')));
  }else report=await prepare(root,out);
  packages[sex]={root,out,manifestSha256:sha(manifestBytes),runtime:manifest.runtime,fileCount:report.files.length,
    derivativeMode:reuseDerivatives?'reused-original-tested-compression':'fresh-prepare',rawBytes:report.files.reduce((n,f)=>n+f.bytes,0),transfers:Object.fromEntries(['gzip','br'].map(c=>[c,report.files.reduce((n,f)=>n+(f.encodings[c]?.retained?f.encodings[c].bytes:f.bytes),0)]))};
  check(`${sex} pinned runtime`,manifest.runtime.buildId==='801c7a9c9026');
  let roundtrips=0;
  for(const row of report.files){
    const raw=await fs.readFile(path.join(root,row.path));
    check(`${sex} source ${row.path}`,sha(raw)===row.sha256&&raw.length===row.bytes);
    for(const [coding,item] of Object.entries(row.encodings))if(item.retained){
      const encoded=await fs.readFile(path.join(out,item.path));
      const decoded=coding==='gzip'?gunzipSync(encoded):brotliDecompressSync(encoded);
      check(`${sex} decode ${coding} ${row.path}`,decoded.equals(raw)&&sha(encoded)===item.sha256&&encoded.length===item.bytes);roundtrips++;
    }
  }
  packages[sex].roundtrips=roundtrips;
  for(const mode of ['identity','gzip','br']){
    const bundle=await createServer(root,out,mode);await listen(bundle.server);
    try{
      for(const row of report.files){
        const res=await request(bundle.server,'/'+row.path,{'Accept-Encoding':'br, gzip'});
        const expected=mode!=='identity'&&row.encodings[mode]?.retained?mode:'identity';
        const decoded=expected==='br'?brotliDecompressSync(res.body):expected==='gzip'?gunzipSync(res.body):res.body;
        check(`${sex}/${mode} HTTP ${row.path}`,res.status===200&&(res.headers['content-encoding']??'identity')===expected&&res.headers.vary==='Accept-Encoding'&&Number(res.headers['content-length'])===res.body.length&&sha(decoded)===row.sha256&&res.headers.etag==='"'+sha(res.body)+'-'+expected+'"');
      }
      const target=report.files.find(f=>f.encodings[mode]?.retained)||report.files[0];
      const url='/'+target.path;
      const normal=await request(bundle.server,url,{'Accept-Encoding':mode});
      const head=await request(bundle.server,url,{'Accept-Encoding':mode},'HEAD');
      check(`${sex}/${mode} HEAD`,head.status===200&&head.body.length===0&&head.headers.etag===normal.headers.etag&&head.headers['content-length']===normal.headers['content-length']);
      for(const tag of [normal.headers.etag,'W/'+normal.headers.etag,'"other", '+normal.headers.etag,'*']){
        const hit=await request(bundle.server,url,{'Accept-Encoding':mode,'If-None-Match':tag});
        check(`${sex}/${mode} cache ${tag}`,hit.status===304&&hit.body.length===0&&hit.headers.vary==='Accept-Encoding'&&hit.headers.etag===normal.headers.etag);
      }
      const refused=await request(bundle.server,url,{'Accept-Encoding':'*;q=0'});
      check(`${sex}/${mode} refusal`,refused.status===406&&(!reuseDerivatives||(refused.headers.vary==='Accept-Encoding'&&refused.headers['cache-control']==='no-store')),{vary:refused.headers.vary??null,cacheControl:refused.headers['cache-control']??null});
      const bad=await request(bundle.server,'/%2Findex.html');check(`${sex}/${mode} encoded double slash rejected`,bad.status===400);
      const malformed=await request(bundle.server,'/%zz');check(`${sex}/${mode} malformed URL rejected`,malformed.status===400);
      const missing=await request(bundle.server,'/not-in-package');check(`${sex}/${mode} undeclared URL rejected`,missing.status===404);
      const post=await request(bundle.server,url,{},'POST');check(`${sex}/${mode} method rejected`,post.status===405&&post.headers.allow==='GET, HEAD');
    }finally{await close(bundle.server);}
  }
}
const male=packages.male;
const brBundle=await createServer(male.root,male.out,'br');await listen(brBundle.server);
try{
  const cases=[
    [undefined,'identity',200],['','identity',200],['gzip','identity',200],['br','br',200],
    ['br;q=0, gzip;q=0','identity',200],['br;q=0, identity;q=0',null,406],
    ['br;q=0, *;q=0',null,406],['*;q=0, br;q=1','br',200],
    ['br;q=0.5, identity;q=0.2','br',200],['br;q=0.1, identity;q=1','identity',200],
    ['BR;Q=1, identity;q=0','br',200],['unknown','identity',200],['br;q=1.2, identity;q=0',null,406]
  ];
  for(const [accept,expected,status] of cases){
    const res=await request(brBundle.server,'/index.html',accept===undefined?{}:{'Accept-Encoding':accept});
    check(`negotiation ${JSON.stringify(accept)}`,res.status===status&&(status!==200||(res.headers['content-encoding']??'identity')===expected),{status:res.status,encoding:res.headers['content-encoding']??null});
  }
  const encoded=await request(brBundle.server,'/index.html',{'Accept-Encoding':'br'});
  const identity=await request(brBundle.server,'/index.html',{'Accept-Encoding':'identity','If-None-Match':encoded.headers.etag});
  check('encoded ETag cannot validate identity',identity.status===200&&identity.headers.etag!==encoded.headers.etag);
}finally{await close(brBundle.server);}

// Use complete real package copies for rejection tests. No original input is mutated.
const fixture=path.join(evidence,'source-fixture');await fs.cp(male.root,fixture,{recursive:true});
const coding=JSON.parse(await fs.readFile(path.join(male.out,'http-coding.json')));
async function candidate(name,transform){const dir=path.join(evidence,name);await fs.cp(male.out,dir,{recursive:true});const manifest=structuredClone(coding);await transform(manifest,dir);await fs.writeFile(path.join(dir,'http-coding.json'),json(manifest));return dir;}
const dropped=await candidate('missing-row',m=>{m.files.pop();});
await expectReject('missing declaration rejects before listen',()=>createServer(fixture,dropped));
const duplicate=await candidate('duplicate-row',m=>{m.files[m.files.length-1]=structuredClone(m.files[0]);});
await expectReject('duplicate declaration rejects before listen',()=>createServer(fixture,duplicate));
const corrupt=await candidate('corrupt-encoded',async(m,dir)=>{const row=m.files.find(r=>r.encodings.br?.retained);const f=path.join(dir,row.encodings.br.path);const bytes=await fs.readFile(f);bytes[0]^=255;await fs.writeFile(f,bytes);});
await expectReject('corrupt encoded bytes rejects before listen',()=>createServer(fixture,corrupt));
const wrongDecode=await candidate('wrong-decoded',async(m,dir)=>{const row=m.files.find(r=>r.encodings.gzip?.retained);const item=row.encodings.gzip;const bytes=gzipSync(Buffer.from('valid gzip but different source bytes'));await fs.writeFile(path.join(dir,item.path),bytes);item.bytes=bytes.length;item.sha256=sha(bytes);});
await expectReject('valid encoded hash but wrong decoded bytes rejects',()=>createServer(fixture,wrongDecode));
const traversal=await candidate('traversal-path',m=>{m.files[0].path='../outside';});
await expectReject('unsafe source declaration rejects before listen',()=>createServer(fixture,traversal));
const outsideEncoding=await candidate('unsafe-encoding-path',m=>{m.files.find(r=>r.encodings.br?.retained).encodings.br.path='../outside';});
await expectReject('unsafe derivative declaration rejects before listen',()=>createServer(fixture,outsideEncoding));
const leaked=Buffer.from('independent-fixture-undeclared-root-file\n');await fs.writeFile(path.join(fixture,'undeclared.txt'),leaked);
const substitution=await candidate('substituted-manifest-row',m=>{m.files=m.files.map(row=>row.path==='runtime-package.json'?{path:'undeclared.txt',bytes:leaked.length,sha256:sha(leaked),encodings:{}}:row);});
let substitutionResult;
try{
  const bundle=await createServer(fixture,substitution);await listen(bundle.server);
  try{const res=await request(bundle.server,'/undeclared.txt');substitutionResult={accepted:true,status:res.status,bodySha256:sha(res.body),matchesUndeclared:res.body.equals(leaked)};}
  finally{await close(bundle.server);}
}catch(error){substitutionResult={accepted:false,error:error.message};}
check('undeclared replacement must reject',!substitutionResult.accepted,substitutionResult);
const changed=path.join(fixture,coding.files[0].path);await fs.appendFile(changed,'changed');
await expectReject('source changed rejects before listen',()=>createServer(fixture,male.out));
const partialOut=path.join(evidence,'prepare-failed-output');
const prepareError=await expectReject('prepare rejects modified source',()=>prepare(fixture,partialOut));
const outputExists=Boolean(await fs.stat(partialOut).catch(()=>null));
const reportExists=Boolean(await fs.stat(path.join(partialOut,'http-coding.json')).catch(()=>null));
check('failed prepare leaves no final candidate',!outputExists,{outputExists,reportExists,prepareError});
if(reuseDerivatives){
  const stages=(await fs.readdir(evidence)).filter(name=>name.startsWith('prepare-failed-output.stage-'));
  const failedReceipts=await Promise.all(stages.map(async name=>JSON.parse(await fs.readFile(path.join(evidence,name,'FAILED.json')))));
  check('failed preparation has separate failure receipt',failedReceipts.length===1&&failedReceipts[0].status==='failed'&&failedReceipts[0].reason.includes('Dependency identity differs'),{failedReceipts});
  // A tiny subset uses an actual source resource to check successful rename/retry without recompressing the two packages.
  const tinyRoot=path.join(evidence,'small-real-resource-package');await fs.mkdir(tinyRoot);
  const original=JSON.parse(await fs.readFile(path.join(male.root,'runtime-package.json')));
  const first=original.files[0];original.files=[first];
  await fs.mkdir(path.dirname(path.join(tinyRoot,first.path)),{recursive:true});
  await fs.copyFile(path.join(male.root,first.path),path.join(tinyRoot,first.path));
  await fs.writeFile(path.join(tinyRoot,'runtime-package.json'),json(original));
  const successful=await prepare(tinyRoot,partialOut);
  const successfulManifest=JSON.parse(await fs.readFile(path.join(partialOut,'http-coding.json')));
  check('retry publishes final output after failure',successful.files.length===2&&successfulManifest.files.length===2);
  const remainingStages=(await fs.readdir(evidence)).filter(name=>name.startsWith('prepare-failed-output.stage-'));
  check('successful prepare consumes its stage and preserves previous failure',remainingStages.length===1&&remainingStages[0]===stages[0]);
}
await expectReject('prepare output conflict rejects',()=>prepare(male.root,male.out));
const finalSnapshot={transport:sha(await fs.readFile(transportFile)),prepare:sha(await fs.readFile(prepareFile))};
check('tested source unchanged during probe',snapshot.transport===finalSnapshot.transport&&snapshot.prepare===finalSnapshot.prepare,{snapshot,finalSnapshot});
const result={schema:'independent-http-transport-review-v1',started,ended:new Date().toISOString(),node:process.version,sourceSha256:snapshot,finalSha256:finalSnapshot,packages,checks,failures,limits:['CPU localhost HTTP only. No browser decode or GPU/memory claim.','All negative mutations confined to evidence directory copies.','Wall-clock compression measurements in derivative manifests are incidental and not benchmark results.',...(reuseDerivatives?['Full package compression derivatives reused from original test. New successful staging/retry uses a tiny subset with one real source asset.']:[])]};
await fs.writeFile(path.join(evidence,'result.json'),json(result));
console.log(json({sourceSha256:snapshot,checks:checks.length,failures,packages}));
