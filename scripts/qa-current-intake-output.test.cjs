const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {spawnSync}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const test=require('node:test');
const {productionRoot,projectOutput}=require('./project-output.cjs');

const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const scripts=path.resolve(__dirname);
const entry={
  image:path.join(scripts,'qa-record-image-lifecycle.cjs'),
  stream:path.join(scripts,'qa-rule-stream-lifecycle.cjs'),
  game:path.join(scripts,'../evidence/m2-rule-strict-cdp-content-v1/game/check-cold.cjs'),
  room:path.join(scripts,'production/verify_record_room.py'),
};
const base='http://127.0.0.1:1/';
function invoke(file,args,env={},preload){
  const python=file===entry.room;
  return spawnSync(python?'python':process.execPath,[...(python?['-B']:preload?['--require',preload]:[]),file,...args],{
    cwd:path.parse(scripts).root,encoding:'utf8',windowsHide:true,timeout:25000,
    env:{...process.env,NODE_DISABLE_COMPILE_CACHE:'1',...env},
  });
}
function argsFor(out,record='missing',config='missing',pin='0'.repeat(64),build='000000000000'){
  return {
    image:[base,record,out,build,'--ordinary-package',pin,'--browser-config',config],
    stream:[base,pin,out,'--browser-config',config],
    game:[base,pin,record,out,'--browser-config',config],
    room:['--pair','missing','missing','--fixed-root','missing','--commit','0'.repeat(40),'--digest',pin,'--out',out],
  };
}
async function fixture(t){
  const root=await productionRoot();
  const area=await fs.mkdtemp(await projectOutput(path.join(root,'experiments','qa-intake-'),root));
  t.after(async()=>{assert.equal(await projectOutput(area,root),area);await fs.rm(area,{recursive:true});});
  return {root,area};
}
test('four real entries reject the drive root, absolute backtracking and a drive-root junction before input reads',async t=>{
  const {root,area}=await fixture(t),drive=path.parse(root).root,link=path.join(area,'root-link');
  await fs.symlink(drive,link,process.platform==='win32'?'junction':'dir');
  try{
    for(const dest of [drive,root+path.sep+'..',link]){
      for(const [name,args] of Object.entries(argsFor(dest))){
        const result=invoke(entry[name],args);
        assert.equal(result.status,1,result.stderr);assert.match(result.stderr,/inside the (production tool main checkout|project)/);
      }
    }
  }finally{await fs.unlink(link);}
});

test('the strict QA validates the record ID before deriving a screenshot filename or creating evidence',async t=>{
  const {area}=await fixture(t),record=path.join(area,'pair.json'),out=path.join(area,'result');
  for(const id of ['bad/name','NUL','ending.']){
    await fs.writeFile(record,JSON.stringify([{identity:{id}},{identity:{id:'valid-second'}}]));
    const result=invoke(entry.game,argsFor(out,record).game);
    assert.equal(result.status,1);assert.match(result.stderr,/Unsafe record ID for evidence filename/);
    await assert.rejects(fs.stat(out),{code:'ENOENT'});
  }
});

test('three actual browser entries retry fresh directories, isolate temp and retain only their failure receipt',async t=>{
  const {root,area}=await fixture(t),input=path.join(area,'readonly-input');
  const cfg=path.join(root,'scripts/production/fusion-cft145.json');
  const deployment=JSON.parse(await fs.readFile(cfg));
  try{await fs.access(deployment.executablePath);}catch(error){
    if(error.code!=='ENOENT')throw error;
    return t.skip('Pinned CfT deployment is unavailable for this entry test');
  }
  await fs.mkdir(input);
  const pairFile=path.join(input,'records.json');
  await fs.copyFile(path.join(root,'evidence/m2-first-rule-delivery-v1/game/signed.json'),pairFile);
  const records=JSON.parse(await fs.readFile(pairFile));
  const inventory=JSON.parse(await fs.readFile(path.join(root,'evidence/m2-first-rule-delivery-v1/build/inventory.json')));
  const manifest=Buffer.from(JSON.stringify({schema:'character-record-input-v1',entries:records.map(r=>({
    id:r.identity.id,url:'/records/'+r.identity.id+'.json',recordSha256:r.integrity.recordSha256}))}));
  const file=inventory.files.find(f=>f.path==='records/manifest.json');
  Object.assign(file,{bytes:manifest.length,sha256:sha(manifest)});
  await fs.writeFile(path.join(input,'manifest.json'),manifest);
  const pack=Buffer.from(JSON.stringify(inventory));
  await fs.writeFile(path.join(input,'runtime-package.json'),pack);
  const preload=path.join(area,'preload.cjs');
  await fs.writeFile(preload,`
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),os=require('node:os');
const input=process.env.QA_INPUT;
global.fetch=async url=>{const file=({'/runtime-package.json':'runtime-package.json','/records/manifest.json':'manifest.json'})[new URL(url).pathname];assert(file);return new Response(fs.readFileSync(path.join(input,file)));};
const key=require.resolve(process.env.QA_PW);
require.cache[key]={exports:{chromium:{async launch(options){
 const scratch=os.tmpdir();assert.equal(path.dirname(scratch),process.env.QA_OUT);
 for(const k of ['TMP','TEMP','TMPDIR'])assert.equal(options.env[k],scratch);
 assert.equal(options.downloadsPath,scratch);assert.equal(options.tracesDir,scratch);
 fs.writeFileSync(path.join(scratch,'cpu-only.tmp'),'fixture');throw Error('CPU launch failure in checked scratch');
}}}};
`);
  for(const name of ['image','stream','game']){
    for(const run of ['first','retry']){
      const out=path.join(area,name+'-'+run);
      const result=invoke(entry[name],argsFor(out,pairFile,cfg,sha(pack),inventory.runtime.buildId)[name],
        {QA_INPUT:input,QA_PW:path.join(root,'prototype/node_modules/playwright'),QA_OUT:out},preload);
      assert.equal(result.status,1,result.stderr);
      assert.deepEqual(await fs.readdir(out),['report.json']);
      assert.match((await fs.readFile(path.join(out,'report.json'),'utf8')),/CPU launch failure in checked scratch/);
    }
  }
  assert.deepEqual((await fs.readdir(input)).sort(),['manifest.json','records.json','runtime-package.json']);
});
