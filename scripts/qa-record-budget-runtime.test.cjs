const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {once}=require('node:events');
const fs=require('node:fs/promises');
const {createServer}=require('node:http');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const test=require('node:test');
const {parseArgs,parseCaptureConfig,ordinaryInput}=require('./qa-record-budget-runtime.cjs');
const {productionRoot,projectOutput}=require('./project-output.cjs');

const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const pin=(path,value)=>({path,bytes:Buffer.byteLength(value),sha256:digest(value)});

test('budget CLI preserves the default and forwards explicit browser configuration',()=>{
  const basic=['http://127.0.0.1:1/','records.json','output','60e3934ddd8a'];
  assert.deepEqual(parseArgs(basic).launchOptions,{channel:'chrome'});
  const sha='a'.repeat(64);
  const options=parseArgs([...basic,'--ordinary-package',sha,'--browser-config','cf145.json']);
  assert.equal(options.manifestSha,sha);
  assert.deepEqual(options.launchOptions,{browserConfig:'cf145.json'});
  assert.throws(()=>parseArgs([...basic,'--ordinary-package','bad']),/Usage/);
  assert.throws(()=>parseArgs([...basic,'--browser-config','one','--browser-config','two']),/Expected one/);
  assert.equal(parseArgs([...basic,'--capture-config','capture.json','--ordinary-package',sha]).captureConfigPath,'capture.json');
  assert.throws(()=>parseArgs([...basic,'--capture-config']),/Usage/);
  assert.throws(()=>parseArgs([...basic,'--capture-config','one','--capture-config','two']),/Usage/);
});

const captureReference={schema:'record-budget-capture-v1',deviceDescription:'Fixture development machine',
  viewport:{width:1440,height:900},mode:'headed',sampleSeconds:18};

test('capture config accepts a portable Windows UTF-8 file and rejects ambiguous or invalid settings',()=>{
  const bytes=Buffer.from('\uFEFF'+JSON.stringify(captureReference));
  const {schema,...metadata}=captureReference;
  assert.deepEqual(parseCaptureConfig(bytes),{configSha256:digest(bytes),...metadata});
  for(const change of [{schema:'unknown'},{deviceDescription:'  '},{viewport:{width:1440,height:0}},
    {viewport:{width:'1440',height:900}},{mode:'automatic'},{sampleSeconds:121},{sampleSeconds:12.5},{ordinaryPC:'passed'}])
    assert.throws(()=>parseCaptureConfig(Buffer.from(JSON.stringify({...captureReference,...change}))),{code:'ERR_ASSERTION'});
});

test('configured CLI uses requested samples and separately reports device claims and observations',async t=>{
  const root=await productionRoot();
  const fixture=await fs.mkdtemp(await projectOutput(path.join(root,'experiments','qa-capture-config-test-'),root));
  t.after(async()=>{
    assert.equal(await projectOutput(fixture,root),fixture);
    await fs.rm(fixture,{recursive:true,force:true});
  });
  const config=path.join(fixture,'capture.json'),records=path.join(fixture,'records.json');
  const output=path.join(fixture,'report'),preload=path.join(fixture,'preload.cjs');
  await fs.writeFile(records,JSON.stringify([{identity:{id:'A'}},{identity:{id:'B'}}]));
  await fs.writeFile(config,JSON.stringify({...captureReference,ordinaryPC:'passed'}));
  const drive=path.parse(root).root;
  const script=path.join(__dirname,'qa-record-budget-runtime.cjs');
  const run=(parameters,destination,allowIntervals=true)=>spawnSync(process.execPath,[...parameters,script,'http://127.0.0.1:9/',records,destination,
    '--capture-config',config],{cwd:drive,encoding:'utf8',windowsHide:true,timeout:10000,
      env:{...process.env,CAPTURE_TEST_FRAME_STEP:allowIntervals?'4000':'20000'}});
  const wrong=run([],output);
  assert.equal(wrong.status,1);
  assert.match(wrong.stderr,/Unsupported capture configuration/);
  await assert.rejects(fs.access(output),{code:'ENOENT'});
  const outside=run([],drive);
  assert.equal(outside.status,1);
  assert.match(outside.stderr,/outside-project/);
  await fs.writeFile(config,JSON.stringify(captureReference));
  await fs.writeFile(preload,`
const assert=require('node:assert/strict'), vm=require('node:vm'), Module=require('node:module');
const load=Module._load;
Module._load=function(name,...args){
 if(name!=='./qa-browser-workspace.cjs')return load.call(this,name,...args);
 return {async launchQABrowser(_out,options){
  assert.deepEqual(options,{channel:'chrome',headless:false});
  const page={on(){},goto(){},waitForFunction(){},evaluate(fn,inputs){
   let time=0;
   const gl={VERSION:1,drawingBufferWidth:1400,drawingBufferHeight:800,
    getExtension:()=>({UNMASKED_RENDERER_WEBGL:2}),getParameter:id=>id===1?'WebGL fixture':'Observed GL implementation'};
   const renderer={getContext:()=>gl,render(){},info:{memory:{textures:1,geometries:1},programs:[],render:{calls:1,triangles:2}}};
   const consumer={renderer,buildInfo:{shortId:'fixture'},actors:new Map(),async selectGroup(){return {items:[{status:'completed'}]};}};
   return vm.runInNewContext('('+fn.toString()+')(inputs)',{inputs,__recordConsumer:consumer,innerWidth:1440,innerHeight:900,
    devicePixelRatio:1,document:{visibilityState:'visible',hasFocus:()=>true},navigator:{userAgent:'Fixture UA',platform:'Win32'},
    performance:{now:()=>time},requestAnimationFrame(cb){queueMicrotask(()=>cb(time+=Number(process.env.CAPTURE_TEST_FRAME_STEP)));return time;},
    cancelAnimationFrame(){},setTimeout,clearTimeout});
  }};
  const browser={version:()=>'145.0.0.0-fixture',async newContext(settings){
   assert.deepEqual(settings,{viewport:{width:1440,height:900}});
   return{async newPage(){return page;},async newCDPSession(){return {async send(){}};},async close(){}};
  }};
  return {browser,async close(){}};
 }};
};
`);
  const result=run(['--require',preload],output);
  assert.equal(result.status,0,result.error?.message??result.stdout+result.stderr);
  const report=JSON.parse(await fs.readFile(path.join(output,'report.json')));
  assert.equal(report.status,'measured-capture-only');
  assert.equal(report.ordinaryPC,'not-assessed');
  assert.deepEqual(report.capture.declaredDevice,{description:captureReference.deviceDescription,source:'operator-reported'});
  assert.deepEqual(report.capture.observedBrowser,{version:'145.0.0.0-fixture',selection:'installed-system-chrome'});
  assert.equal(report.cases.length,3);
  for(const row of report.cases){
    assert(row.environment.elapsedSampleMs>=18000);
    assert.deepEqual(row.environment.before.viewport,{width:1440,height:900});
    assert.equal(row.environment.after.webglRenderer,'Observed GL implementation');
  }
  const emptyPath=path.join(fixture,'no-frame-intervals');
  const empty=run(['--require',preload],emptyPath,false);
  assert.equal(empty.status,1);
  const failed=JSON.parse(await fs.readFile(path.join(emptyPath,'report.json')));
  assert.equal(failed.status,'incomplete');
  assert.equal(failed.ordinaryPC,'not-assessed');
  assert.match(failed.failure,/Capture produced no frame intervals/);
});

test('ordinary preflight pins both signed record identities, the manifest, body indexes and equipment', async t=>{
  const files=[];
  const equipment=Object.fromEntries(['top','shoes','bottom'].map(slot=>{
    const row=pin(`assets/${slot}.glb`,slot);files.push(row);
    return [slot,{id:slot,slot,url:'/'+row.path,sha256:row.sha256}];
  }));
  const records=['first','second'].map(id=>{
    const model=pin(`assets/${id}/body.vrm`,id);files.push(model);
    return {identity:{id},integrity:{recordSha256:digest('record '+id)},appearanceRecipe:{
      base:{bodyType:id,sha256:model.sha256},equipment:{resources:equipment}}};
  });
  const ruleBodyDataPacks=records.map(({identity:{id}})=>{
    const index=pin(`character-data/${id}/index.json`,id);files.push(index);
    return {bodyType:id,url:'/'+index.path,sha256:index.sha256,bytes:index.bytes};
  });
  let manifest=JSON.stringify({schema:'character-record-input-v1',ruleBodyDataPacks,
    entries:records.map(({identity:{id},integrity:{recordSha256}})=>({id,url:`/records/${id}.json`,recordSha256}))});
  files.push(pin('records/manifest.json',manifest));
  const buildId='60e3934ddd8a';
  const game=JSON.stringify({schema:'game-character-record-package-v1',runtime:{buildId,
    entryUrl:'record-consumer.html?records=/records/manifest.json'},records:records.map(record=>({
      id:record.identity.id,recordSha256:record.integrity.recordSha256,bodyType:record.appearanceRecipe.base.bodyType,
      avatarSha256:record.appearanceRecipe.base.sha256})),files});
  const server=createServer((req,res)=>{
    const body={'/runtime-package.json':game,'/records/manifest.json':manifest}[req.url];
    res.writeHead(body?200:404);res.end(body);
  }).listen(0,'127.0.0.1');
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}/`;
  const actual=await ordinaryInput(base,digest(game),buildId,records);
  assert.equal(actual.entry,base+'record-consumer.html?records=/records/manifest.json');
  assert.deepEqual(actual.ruleBodyDataPacks,ruleBodyDataPacks);
  assert.deepEqual(actual.actors.map(a=>a.body),['/assets/first/body.vrm','/assets/second/body.vrm']);
  assert.deepEqual(actual.actors[0].equipment.map(i=>i.slot),['bottom','shoes','top']);
  const changed=structuredClone(records);changed[1].integrity.recordSha256=digest('changed');
  await assert.rejects(ordinaryInput(base,digest(game),buildId,changed),{code:'ERR_ASSERTION'});
  await assert.rejects(ordinaryInput(base,digest('wrong manifest'),buildId,records),/Package manifest SHA mismatch/);
  manifest+=' ';
  await assert.rejects(ordinaryInput(base,digest(game),buildId,records),/Record manifest SHA mismatch/);
});
