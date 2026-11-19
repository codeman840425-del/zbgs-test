const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const test = require('node:test');
const {productionRoot,projectOutput} = require('./project-output.cjs');

const execute = promisify(execFile);
const cliCases = [
  ['m2-appearance-final', out=>[out], 'm2-appearance-workbench-8b9023a1e89c'],
  ['m2-appearance-rapid-check', out=>[out], 'm2-appearance-workbench-b44b5af53491/rapid-corrected'],
  ['m2-appearance-workbench', out=>[out], 'm2-appearance-workbench-b44b5af53491'],
  ['m2-preset-visual-triage', out=>['http://127.0.0.1:4196/','83decd027116',out]],
  ['native-capability-gap', out=>[out,'--expect-accessories'], 'native-capability-gap-987-v1'],
  ['native-vroid-study', (out,request)=>['--run',request,out]],
  ['source-proportioned-face', (out,request)=>[out,request]],
  ['vest-public-ui', out=>['83decd027116',out]],
  ['workbench-movement-diagnosis', out=>[out]],
  ['workbench-movement-ray', out=>[out]],
];

// Loaded in a child Node process before the actual entry point. No browser
// binary is loaded. Probes of the archived defaults intercept every write.
function preload() {
  const fs=require('node:fs'),fsp=require('node:fs/promises'),path=require('node:path');
  const assert=require('node:assert/strict'),Module=require('node:module');
  const {phase,expected,headed}=JSON.parse(process.env.LEGACY_QA_CASE);
  const mark=(event,value)=>process.stderr.write('QA_EVENT '+JSON.stringify([event,value])+'\n');
  if(phase==='default'||phase==='reject'){
    for(const name of ['mkdir','mkdtemp','copyFile','writeFile'])fsp[name]=async target=>{
      mark(name,target);
      if(phase==='default' && name==='mkdir' && target===path.dirname(expected))return;
      throw Error('Intercepted '+name);
    };
  }
  const load=Module._load;
  Module._load=function(name,...args){
    if(name!=='../prototype/node_modules/playwright')return load.call(this,name,...args);
    async function launch(options,profile){
      mark('launch',options.headless);
      assert.equal(options.channel,'chrome');
      assert.equal(options.headless,!headed);
      const scratch=process.env.TMPDIR;
      assert.equal(path.dirname(scratch),expected);
      assert.equal(options.downloadsPath,scratch);
      assert.equal(options.tracesDir,scratch);
      assert.equal(options.env.CHROME_LOG_FILE,path.join(scratch,'chrome.log'));
      fs.writeFileSync(path.join(scratch,'scratch.tmp'),'mock');
      if(phase==='launch-failure')throw Error('mock launch failure');
      const close=async()=>mark('closed',true);
      if(profile){
        assert.equal(profile,path.join(expected,'profile'));
        assert.deepEqual(options.ignoreDefaultArgs,['--disable-renderer-backgrounding']);
        assert.deepEqual(options.recordVideo,{dir:path.join(expected,'video'),size:{width:1440,height:900}});
        fs.mkdirSync(profile,{recursive:true});fs.writeFileSync(path.join(profile,'Default'),'mock profile');
        return {close};
      }
      const failSetup=async()=>{mark('setup',true);throw Error('mock page setup failure');};
      return {close,newContext:failSetup,newPage:failSetup};
    }
    return {chromium:{launch,launchPersistentContext:(profile,options)=>launch(options,profile)}};
  };
}

test('legacy workbench entries confine defaults, CLI outputs, browser scratch and persistent profile',async t=>{
  const root=await productionRoot();
  const temp=await fs.mkdtemp(await projectOutput(path.join(root,'experiments','legacy-workbench-'),root));
  const alias=path.join(temp,'drive'),drive=path.parse(root).root;
  t.after(async()=>{
    await fs.unlink(alias).catch(error=>{if(error.code!=='ENOENT')throw error;});
    assert.equal(await projectOutput(temp,root),temp);
    await fs.rm(temp,{recursive:true});
  });
  await fs.symlink(drive,alias,process.platform==='win32'?'junction':'dir');
  const mock=path.join(temp,'mock.cjs'),nativeRequest=path.relative(temp,path.join(root,'evidence/native-vroid-room-78912-v1/request.json'));
  await fs.writeFile(mock,'('+preload.toString()+')()');
  await fs.writeFile(path.join(temp,'face.json'),JSON.stringify({inputs:[['source','prototype/package.json'],['reference','prototype/package-lock.json']]}));
  async function run(args,phase,expected,headed=false){
    let code=0,stderr='';
    try{({stderr}=await execute(process.execPath,['--require',mock,...args],{cwd:temp,timeout:60000,windowsHide:true,
      env:{...process.env,TMP:temp,TEMP:temp,TMPDIR:temp,LEGACY_QA_CASE:JSON.stringify({phase,expected,headed})}}));}
    catch(error){if(typeof error.code!=='number')throw error;code=error.code;stderr=error.stderr;}
    const events=stderr.split(/\r?\n/).filter(line=>line.startsWith('QA_EVENT ')).map(line=>JSON.parse(line.slice(9)));
    return {code,stderr,events};
  }
  const missing='does-not-exist.json';
  for(const [name,args,defaultPath] of cliCases){
    const file=path.join(__dirname,'qa-'+name+'.cjs');
    const headed=name==='m2-preset-visual-triage';
    for(const dest of [drive,path.relative(temp,drive),path.join(alias,'outside')]){
      const result=await run([file,...args(dest,missing)],'reject');
      assert.equal(result.code,1,name);assert.match(result.stderr,/Production output must be inside the project/,name);
      assert.deepEqual(result.events,[],name);
    }
    if(defaultPath){
      const expected=path.join(root,'evidence',defaultPath);
      const result=await run([file,...(name==='native-capability-gap'?['--expect-accessories']:[])],'default',expected);
      assert.deepEqual(result.events.at(-1),['mkdir',expected],name);
      assert.ok(result.events.every(([event])=>event==='mkdir'));
    }
    const dest=path.join(temp,name);
    const input=name==='native-vroid-study'?nativeRequest:'face.json';
    const result=await run([file,...args(path.relative(temp,dest),input)],'setup',dest,headed);
    assert.deepEqual(result.events,[['launch',!headed],['setup',true],['closed',true]],name+' '+result.stderr);
    assert.ok(!(await fs.readdir(dest)).some(entry=>entry.startsWith('.browser-')),name);
    assert.ok((await fs.readdir(dest)).some(entry=>entry.endsWith('report.json')),name);
  }
  const native=path.join(__dirname,'qa-native-vroid-study.cjs');
  const rejectPrepare=await run([native,'--prepare',path.join(alias,'outside')],'reject');
  assert.match(rejectPrepare.stderr,/Production output must be inside the project/);
  assert.deepEqual(rejectPrepare.events,[]);
  const prepared=path.join(temp,'prepared');
  const prepare=await run([native,'--prepare',prepared],'prepare',prepared);
  assert.equal(prepare.code,0,prepare.stderr);assert.deepEqual(prepare.events,[]);
  assert.equal(JSON.parse(await fs.readFile(path.join(prepared,'prepare-report.json'))).browserLaunched,false);

  const workspace=path.join(__dirname,'qa-browser-workspace.cjs');
  const dest=path.join(temp,'persistent');await fs.mkdir(dest);
  const call=(profile,video)=>['-e',
    "const [mod,out,profile,dir]=process.argv.slice(1);(async()=>{const session=await require(mod).launchPersistentQABrowser(out,profile,{channel:'chrome',headless:false,ignoreDefaultArgs:['--disable-renderer-backgrounding'],recordVideo:{dir,size:{width:1440,height:900}}});await session.close();})()",
    workspace,dest,profile,video];
  const profile=path.join(dest,'profile'),video=path.join(dest,'video');
  for(const args of [call(alias,video),call(profile,alias)]){
    const result=await run(args,'reject');
    assert.match(result.stderr,/Production output must be inside the project/);assert.deepEqual(result.events,[]);
  }
  const failed=await run(call(profile,video),'launch-failure',dest,true);
  assert.match(failed.stderr,/mock launch failure/);assert.deepEqual(await fs.readdir(dest),[]);
  const retried=await run(call(profile,video),'retry',dest,true);
  assert.equal(retried.code,0,retried.stderr);assert.deepEqual(retried.events,[['launch',false],['closed',true]]);
  assert.deepEqual(await fs.readdir(dest),['profile']);
  assert.equal(await fs.readFile(path.join(profile,'Default'),'utf8'),'mock profile');
});
