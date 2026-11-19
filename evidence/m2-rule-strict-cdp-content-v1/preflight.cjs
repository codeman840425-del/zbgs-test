const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {productionRoot,projectOutput}=require('../../scripts/project-output.cjs');
const hash=b=>createHash('sha256').update(b).digest('hex');

// The normal entry reaches browser launch after its signed-input and manifest checks.
// This child uses the package's existing manifest bytes and stops exactly at launch.
if(require.main!==module){
  global.fetch=async url=>{
    assert.equal(url.href,'http://127.0.0.1/runtime-package.json');
    return new Response(await fs.readFile(path.join(process.env.STRICT_CPU_GAME,'runtime-package.json')));
  };
  require('../../scripts/qa-browser-workspace.cjs').launchQABrowser=async()=>{throw Error('CPU preflight reached browser launch');};
}else main().catch(e=>{console.error(e);process.exitCode=1;});

async function main(){
  const {publishedInputs,strictContentPins}=require('../../scripts/qa-published-rule-body.cjs');
  const root=await productionRoot(),receiver='F:/gamemake-test/rule-blind-9c72d4fd/output/receiver-cft-replay';
  const previous=path.join(root,'evidence/m2-frozen-rule-game-v1/input/previous.json');
  const historicEntry=path.join(root,'evidence/m2-first-rule-delivery-v1/game/check-cold.cjs');
  const originalSha=hash(await fs.readFile(historicEntry));
  assert.equal(originalSha,'47e9e89329b9c0745ff3b9f3780dd996037f233496f6a67f968d198adf45cb29');
  const scratch=await fs.mkdtemp(await projectOutput(path.join(__dirname,'.preflight-'),root));
  const result={historicalEntrySha256:originalSha,entrySha256:hash(await fs.readFile(path.join(__dirname,'game/check-cold.cjs'))),packages:[]};
  try{
    for(const [id,oldPin] of [
      ['receiver-jaw-orchid','7876b968c916303cad40a3a856009b35eaa9d8700b34b38f4ac7a00c0d93bc03'],
      ['receiver-jaw-cedar','3b26ad7051ff02dcf9f22de960b63837f66327125cc84ecbc68913569d42a2cc']
    ]){
      const dir=path.join(receiver,id),game=path.join(dir,'game');
      const raw=await fs.readFile(path.join(receiver,id+'-strict','report.json'));
      assert.equal(hash(raw),oldPin);const old=JSON.parse(raw);
      const inventory=await fs.readFile(path.join(game,'runtime-package.json'));
      const pack=JSON.parse(inventory),signedFile=path.join(dir,'records.json');
      const signed=JSON.parse(await fs.readFile(signedFile)),receipt=JSON.parse(await fs.readFile(path.join(dir,'receipt.json')));
      assert.equal(hash(inventory),old.manifestSha);assert.equal(old.manifestSha,receipt.packageManifestSha256);
      const publicationArgs=['--published',receipt.shapePack.indexSha256,previous];
      const publication=await publishedInputs(publicationArgs,signed),origin=new URL('http://127.0.0.1/');
      const pins=strictContentPins(origin,new Map(pack.files.map(f=>['/'+f.path,f])),signed,publication,
        'eec4ef8ab2fb073f7674cc6e839cbad7aea6931e4b19e8e70c0ee46c5fda2d06');
      const urls=new Set([...pins.keys()].map(u=>new URL(u).pathname));
      const sessions=old.sessions.map(session=>{
        assert.deepEqual(urls,new Set(session.responses.map(r=>r.url)));
        const requests=session.networkDiagnostics.requestLifecycle.filter(r=>
          r.events.some(e=>e.event==='request'&&urls.has(new URL(e.url).pathname)));
        return {phase:session.phase,measured:session.responses.reduce((n,r)=>n+r.attempts.length,0),
          matchingRequestIds:requests.length,canceled:requests.filter(r=>r.events.some(e=>e.event==='fail')).map(r=>r.requestId)};
      });
      const out=await projectOutput(path.join(scratch,id),root);
      const child=spawnSync(process.execPath,['--require',__filename,path.join(__dirname,'game/check-cold.cjs'),
        origin.href,old.manifestSha,signedFile,out,...publicationArgs,'--cdp-content',
        '--browser-config',path.join(root,'scripts/production/fusion-cft145.json')],{
          cwd:path.parse(root).root,encoding:'utf8',env:{...process.env,STRICT_CPU_GAME:game},windowsHide:true
        });
      assert.equal(child.status,1,child.stderr);
      const probe=JSON.parse(await fs.readFile(path.join(out,'report.json')));
      assert.match(probe.failure,/CPU preflight reached browser launch/);assert.deepEqual(probe.sessions,[]);
      result.packages.push({id,game,manifestSha256:old.manifestSha,indexSha256:publication.indexSha256,
        previousStrictReportSha256:oldPin,previousStrictStatus:old.networkIntegrityStatus,targetUrls:pins.size,sessions,
        cpuEntry:'verified through pre-launch boundary'});
    }
  }finally{
    assert.equal(await projectOutput(scratch,root),scratch);await fs.rm(scratch,{recursive:true,force:true});
  }
  console.log(JSON.stringify(result,null,2));
}
