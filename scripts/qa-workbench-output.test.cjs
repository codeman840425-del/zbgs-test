const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const {randomBytes}=require('node:crypto');
const fs=require('node:fs/promises');
const path=require('node:path');
const test=require('node:test');
const {productionRoot,projectOutput}=require('./project-output.cjs');

const base='http://127.0.0.1:4196/';
const scripts={
  'qa-workbench-release-smoke.cjs':(build,out)=>[build,'/evidence/fixture/',out,'--video-count=1','--jaw-hair'],
  'qa-workbench-current-samples.cjs':(build,out)=>[base,build,out],
  'qa-workbench-space-ui.cjs':()=>[],
};
const space='qa-workbench-space-ui.cjs';
const buildId=()=>randomBytes(6).toString('hex');

test('4196 evidence paths are checked before writes and mocked Chrome is always released',async t=>{
  const root=await productionRoot(),drive=path.parse(root).root;
  const fixture=await fs.mkdtemp(await projectOutput(path.join(root,'experiments','qa-workbench-path-'),root));
  const outsideCwd=path.join(fixture,'external-cwd'),alias=path.join(fixture,'drive-junction');
  const defaults=[];
  t.after(async()=>{
    await fs.unlink(alias).catch(error=>{if(error.code!=='ENOENT')throw error;});
    for(const dir of [...defaults,fixture]){
      assert.equal(await projectOutput(dir,root),dir);
      await fs.rm(dir,{recursive:true,force:true});
    }
  });
  await fs.mkdir(outsideCwd);
  await fs.symlink(drive,alias,process.platform==='win32'?'junction':'dir');
  const preload=path.join(fixture,'playwright-fixture.cjs');
  await fs.writeFile(preload,String.raw`
const assert=require('node:assert/strict');
const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const Module=require('node:module'),load=Module._load;
const note=name=>process.stderr.write('FIXTURE '+name+'\n');
const phase=process.env.WORKBENCH_FIXTURE_PHASE,out=process.env.WORKBENCH_FIXTURE_OUTPUT;
for(const name of ['mkdir','mkdtemp','copyFile','writeFile']){
 const write=fsp[name];
 fsp[name]=(...args)=>{
  const target=path.resolve(args[name==='copyFile'?1:0]);
  if(phase==='reject'||!(target===out||target.startsWith(out+path.sep))){
   note('unexpected-'+name);
   throw Error('Fixture refused a write outside the expected evidence: '+target);
  }
  return write(...args);
 };
}
Module._load=function(name,...args){
 if(name!=='../prototype/node_modules/playwright')return load.call(this,name,...args);
 note('playwright');
 return {chromium:{async launch(options){
  note('launch');
  const scratch=os.tmpdir();
  assert.equal(path.dirname(scratch),out);
  assert.equal(options.channel,'chrome');
  assert.equal(options.headless,true);
  assert.equal(options.downloadsPath,scratch);
  assert.equal(options.tracesDir,scratch);
  for(const key of ['TEMP','TMP','TMPDIR','XDG_CACHE_HOME','CUDA_CACHE_PATH','__GL_SHADER_DISK_CACHE_PATH'])
   assert.equal(options.env[key],scratch);
  assert(options.args.includes('--disk-cache-dir='+path.join(scratch,'disk-cache')));
  assert(options.args.includes('--crash-dumps-dir='+scratch));
  fs.writeFileSync(path.join(scratch,'test.tmp'),'mock browser scratch');
  if(phase==='launch')throw Error('mock launch failure');
  const newPage=async()=>{
   note('page');
   if(phase!=='recording')throw Error('mock post-launch failure');
   return {on(){},goto(){throw Error('mock navigation failure');},video(){
    return {saveAs(file){
     assert.equal(path.dirname(file),out);
     note('video-save');
     throw Error('mock recording save failure');
    }};
   }};
  };
  return {newPage,async newContext(options){
   if(options.recordVideo)assert.equal(options.recordVideo.dir,out);
   return {newPage,async addInitScript(){},async close(){note('context-close');}};
  },async close(){note('close');}};
 }}};
};
`);
  const invoke=(script,{destination,cwd,phase,output='',build=buildId()})=>{
    const env={...process.env,QA_M2_BUILD:build,QA_M2_URL:base,
      WORKBENCH_FIXTURE_OUTPUT:output,WORKBENCH_FIXTURE_PHASE:phase};
    delete env.QA_M2_OUT;
    if(script===space && destination!==undefined)env.QA_M2_OUT=destination;
    const result=spawnSync(process.execPath,['--require',preload,path.join(__dirname,script),...scripts[script](build,destination)],{
      cwd,env,encoding:'utf8',windowsHide:true,timeout:15000,
    });
    assert.equal(result.status,1,result.error?.message??result.stderr);
    const effects=[...result.stderr.matchAll(/^FIXTURE (.+)$/gm)].map(match=>match[1]);
    return {result,effects};
  };
  const absentAtRoot=path.join(drive,path.basename(fixture)+'-outside');
  for(const script of Object.keys(scripts)){
    for(const [cwd,destination] of [[drive,drive],[outsideCwd,absentAtRoot],
      [outsideCwd,path.relative(outsideCwd,absentAtRoot)],[outsideCwd,path.join(alias,path.basename(absentAtRoot))]]){
      const {result,effects}=invoke(script,{destination,cwd,phase:'reject'});
      assert.match(result.stderr,/Production output must be inside the project/,script);
      assert.deepEqual(effects,[],script);
    }
    for(const phase of ['launch','post-launch',...(script==='qa-workbench-current-samples.cjs'?['recording']:[])]){
      const out=path.join(fixture,script.replace('.cjs','')+'-'+phase);
      const destination=phase==='launch'?out:path.relative(outsideCwd,out);
      const {effects}=invoke(script,{destination,cwd:outsideCwd,phase,output:out});
      assert.deepEqual(effects,phase==='launch'?['playwright','launch']:phase==='recording'?
        ['playwright','launch','page','context-close','video-save','close']:
        ['playwright','launch','page',...(script==='qa-workbench-current-samples.cjs'?['context-close']:[]),'close'],script);
      const files=await fs.readdir(out);
      assert.deepEqual(files.sort(),['executed-script.cjs','report.json']);
      const report=JSON.parse(await fs.readFile(path.join(out,'report.json'),'utf8'));
      if(phase==='recording')assert.match(report.recordingError,/mock recording save failure/);
      else assert.match(report.failure??report.error??report.fatal,new RegExp('mock '+phase+' failure'),script);
    }
  }
  for(const cwd of [drive,outsideCwd]){
    const build=buildId(),out=path.join(root,'evidence','workbench-space-ui-'+build);
    assert.equal(await projectOutput(out,root),out);
    await assert.rejects(fs.lstat(out),{code:'ENOENT'});
    defaults.push(out);
    const {effects}=invoke(space,{cwd,phase:'launch',output:out,build});
    assert.deepEqual(effects,['playwright','launch']);
    assert.deepEqual((await fs.readdir(out)).sort(),['executed-script.cjs','report.json']);
    await assert.rejects(fs.lstat(path.join(cwd,'evidence','workbench-space-ui-'+build)),{code:'ENOENT'});
  }
  const prepared=path.join(fixture,'prepared'),rawVideo=path.join(prepared,'raw-video');
  await fs.mkdir(prepared);
  await fs.symlink(drive,rawVideo,process.platform==='win32'?'junction':'dir');
  try{
    const {result,effects}=invoke(space,{destination:prepared,cwd:outsideCwd,phase:'reject'});
    assert.match(result.stderr,/Production output must be inside the project/);
    assert.deepEqual(effects,[]);
    assert.deepEqual(await fs.readdir(prepared),['raw-video']);
  }finally{await fs.unlink(rawVideo);}
  await assert.rejects(fs.lstat(absentAtRoot),{code:'ENOENT'});
  assert.deepEqual(await fs.readdir(outsideCwd),[]);
});
