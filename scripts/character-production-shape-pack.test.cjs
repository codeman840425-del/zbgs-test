const assert = require('node:assert/strict');
const {execFile} = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const {promisify} = require('node:util');
const {productionRoot, projectOutput} = require('./project-output.cjs');
const {productionPage} = require('./character-production-browser.cjs');

const run = promisify(execFile);
const body = 'assets/rule-body-0123456789abcdef0123/body.vrm';
const equipment = 'assets/rule-body-0123456789abcdef0123/equipment.json';
const profile = 'character-data/rule-body-0123456789abcdef0123/profile.json';
const manifest = 'records/rule-body-data.json';
const shared = 'assets/raw-male-equipment-v1/raw-male-ab9a-flat-shoes-v1.glb';

async function fixture(t) {
 const root = await productionRoot();
 const prefix = await projectOutput(path.join(root,'experiments','production-shape-test-'),root);
 const area = await fs.mkdtemp(prefix);
 t.after(async()=>{
  assert.equal(await projectOutput(area,root),area);
  await fs.rm(area,{recursive:true});
 });
 const producer = path.join(area,'producer'), tools = path.join(producer,'scripts');
 const caller = path.join(area,'caller'), dist = path.join(area,'dist');
 await Promise.all([fs.mkdir(path.join(tools,'runtime-package'),{recursive:true}),fs.mkdir(caller),fs.mkdir(dist)]);
 for(const name of ['character-production-cli.cjs','project-output.cjs','run-fixed-check.cjs'])
  await fs.copyFile(path.join(__dirname,name),path.join(tools,name));
 await fs.writeFile(path.join(tools,'qa-browser-workspace.cjs'),`
exports.resolveBrowserConfig=async file=>{
 if((await require('node:fs/promises').readFile(file,'utf8'))!=='fixture browser')throw Error('Invalid test deployment');
 return {receipt:{browserVersion:'fixture'}};
};
`);
 const overlayModule = path.join(__dirname,'runtime-package','shape-overlay.cjs');
 await fs.writeFile(path.join(tools,'runtime-package','shape-overlay.cjs'),`
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {assertOverlayDist,isShapeDataPath} = require(${JSON.stringify(overlayModule)});
let calls = 0;
async function verifiedShapeOverlay(directories) {
 assert.equal(++calls,1,'verify once in the serving process');
 const files = new Map([['${manifest}',Buffer.from(JSON.stringify(directories.map(p=>path.basename(p))))]]);
 for(const directory of directories) {
  const entries=JSON.parse(await fs.readFile(path.join(directory,'overlay.json'),'utf8'));
  for(const [name,content] of Object.entries(entries))files.set(name,Buffer.from(content));
 }
 return {files,descriptors:[]};
}
module.exports = {verifiedShapeOverlay,assertOverlayDist,isShapeDataPath};
`);
 // A Node check substitutes for Chrome, while exercising the real D02 CLI and server processes.
 await fs.writeFile(path.join(tools,'character-production-browser.cjs'),`
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
(async()=>{
 const [base,request,out,,,flag,...browserArgs]=process.argv.slice(2);
 const data=JSON.parse(await fs.readFile(request,'utf8'));
 const page=${productionPage.toString()};
 assert.equal(await (await fetch(page(base,flag))).text(),'frozen HTML');
 assert.equal(new URL(page(base,flag)).search,data.packs?'?production=1&ruleBodyData=1':'?production=1');
 const catalog=await fetch(base+'${manifest}');
 assert.equal(catalog.status,data.packs?200:404);
 if(data.packs){
  assert.deepEqual(await catalog.json(),data.packs);
  const model=await fetch(base+'${body}');
  assert.equal(model.headers.get('content-type'),'model/gltf-binary');
  assert.equal(await model.text(),'verified VRM');
  assert.equal(await (await fetch(base+'${equipment}')).text(),'verified equipment');
  assert.equal(await (await fetch(base+'${profile}')).text(),'verified profile');
  assert.equal(await (await fetch(base+'${shared}')).text(),'frozen garment');
  for(const alias of ['${body.toUpperCase()}','${manifest.replace('rule','%72ule')}'])
   assert.equal((await fetch(base+alias)).status,404);
 }
 assert.equal((await fetch(base+'records/manifest.json')).status,404);
 await fs.writeFile(out,JSON.stringify({base,flag,browserArgs}),{flag:'wx'});
})().catch(error=>{console.error(error);process.exitCode=1;});
`);
 const digest='a'.repeat(64);
 await fs.writeFile(path.join(dist,'build-info.json'),JSON.stringify({sourceDigest:digest,shortId:digest.slice(0,12)}));
 await fs.writeFile(path.join(dist,'record-consumer.html'),'frozen HTML');
 async function file(relative,content){
  const filename=path.join(dist,relative);
  await fs.mkdir(path.dirname(filename),{recursive:true});
  await fs.writeFile(filename,content);
 }
 async function pack(name,entries){
  const directory=path.join(caller,name);
  await fs.mkdir(directory);
  await fs.writeFile(path.join(directory,'overlay.json'),JSON.stringify(entries));
  return directory;
 }
 async function invoke(id,packs=[],real=false,browserConfig){
  const out=path.join(producer,id+'.json'), request=path.join(caller,id+'.json');
  await fs.writeFile(request,JSON.stringify(packs.length?{packs:packs.map(p=>path.basename(p))}:{}));
  const args=[real?path.join(__dirname,'character-production-cli.cjs'):path.join(tools,'character-production-cli.cjs'),
   '--dist',dist,'--request',request,'--out',real?path.join(area,id+'.json'):out,...packs.flatMap(p=>['--shape-pack',path.relative(caller,p)])];
  if(browserConfig!==undefined)args.push('--browser-config',browserConfig);
  const result=await run(process.execPath,args,{cwd:caller,windowsHide:true,timeout:30000})
   .then(value=>({...value,code:0}),error=>error);
  return {...result,out:real?path.join(area,id+'.json'):out};
 }
 return {file,pack,invoke,dist,area,caller};
}

test('D02 forwards an explicit config from caller cwd, and rejects a bad config without spawning its check',async t=>{
 const {invoke,caller}=await fixture(t);
 const filename=path.join(caller,'browser config.txt');
 await fs.writeFile(filename,'invalid');
 const failed=await invoke('retry',[],false,path.basename(filename));
 assert.equal(failed.code,1);
 assert.match(failed.stderr,/Invalid test deployment/);
 assert.doesNotMatch(failed.stderr,/Temporary fixed-build check/);
 await assert.rejects(fs.stat(failed.out),{code:'ENOENT'});
 await fs.writeFile(filename,'fixture browser');
 const next=await invoke('retry',[],false,path.basename(filename));
 assert.equal(next.code,0,next.stderr);
 const outcome=JSON.parse(await fs.readFile(next.out,'utf8'));
 assert.equal(outcome.flag,'');
 assert.deepEqual(outcome.browserArgs,['--browser-config',filename]);
});

test('D02 serves multiple shape packs alongside the fixed build and leaves legacy URLs alone',async t=>{
 const {file,pack,invoke}=await fixture(t);
 const old=await invoke('legacy');
 assert.equal(old.code,0,old.stderr);
 assert.equal(JSON.parse(await fs.readFile(old.out,'utf8')).flag,undefined);
 await file(shared,'frozen garment');
 const first=await pack('first',{[body]:'verified VRM',[shared]:'frozen garment'});
 const second=await pack('second',{[equipment]:'verified equipment',[profile]:'verified profile'});
 const next=await invoke('with-packs',[first,second]);
 assert.equal(next.code,0,next.stderr);
 const {base,flag}=JSON.parse(await fs.readFile(next.out,'utf8'));
 assert.equal(flag,'rule-body-data');
 await assert.rejects(fetch(base,{signal:AbortSignal.timeout(1000)}));
});

test('D02 refuses control-file overlays and frozen file collisions before listening',async t=>{
 const {file,pack,invoke,dist,area}=await fixture(t);
 for(const [index,name] of ['assets/replacement.js','record-consumer.html','records/manifest.json','assets/../body.vrm'].entries()){
  const result=await invoke('control-'+index,[await pack('control-pack-'+index,{[name]:'fake'})]);
  assert.equal(result.code,1,result.stderr);
  assert.match(result.stderr,/Unsupported fixed-check shape overlay path/);
  assert.doesNotMatch(result.stderr,/Temporary fixed-build check/);
  await assert.rejects(fs.stat(result.out),{code:'ENOENT'});
 }
 await file(shared,'frozen garment');
 const candidate=await pack('collision-pack',{[shared]:'different garment'});
 const collision=await invoke('collision',[candidate]);
 assert.equal(collision.code,1,collision.stderr);
 assert.match(collision.stderr,/Frozen file conflicts with shape overlay/);
 assert.doesNotMatch(collision.stderr,/Temporary fixed-build check/);
 await assert.rejects(fs.stat(collision.out),{code:'ENOENT'});
 assert.equal(await fs.readFile(path.join(dist,shared),'utf8'),'frozen garment');

 const upper=manifest.replace('rule-body-data','Rule-Body-Data');
 await file(upper,'[]');
 const aliased=await invoke('case-alias',[await pack('case-pack',{})]);
 assert.equal(aliased.code,1,aliased.stderr);
 assert.match(aliased.stderr,/Case conflict/);
 assert.doesNotMatch(aliased.stderr,/Temporary fixed-build check/);
 await fs.unlink(path.join(dist,upper));
 const redirected=path.join(dist,path.dirname(body)), elsewhere=path.join(area,'elsewhere');
 await fs.mkdir(elsewhere);
 await fs.writeFile(path.join(elsewhere,'body.vrm'),'same model bytes');
 await fs.symlink(elsewhere,redirected,process.platform==='win32'?'junction':'dir');
 try{
  const linked=await invoke('junction',[await pack('junction-pack',{[body]:'same model bytes'})]);
  assert.equal(linked.code,1,linked.stderr);
  assert.match(linked.stderr,/Linked path conflicts with shape overlay/);
  assert.doesNotMatch(linked.stderr,/Temporary fixed-build check/);
  assert.equal(await fs.readFile(path.join(elsewhere,'body.vrm'),'utf8'),'same model bytes');
 }finally{await fs.unlink(redirected);}
});

test('D02 runs the real verifier before starting a browser or writing records',async t=>{
 const {pack,invoke}=await fixture(t);
 const fake=await pack('forged',{});
 await fs.writeFile(path.join(fake,'index.json'),'{}');
 await fs.writeFile(path.join(fake,'recipe.json'),'{}');
 const result=await invoke('forged-input',[fake],true);
 assert.equal(result.code,1,result.stderr);
 assert.match(result.stderr,/pack|recipe|template/i);
 assert.doesNotMatch(result.stderr,/Cannot find module|Temporary fixed-build check/);
 await assert.rejects(fs.stat(result.out),{code:'ENOENT'});
});
