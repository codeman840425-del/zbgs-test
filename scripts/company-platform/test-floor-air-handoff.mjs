import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {isDeepStrictEqual,promisify} from 'node:util';

const [sealedArg,workArg,outArg,...extra]=process.argv.slice(2);
assert(sealedArg && workArg && outArg && !extra.length,
  'Usage: node test-floor-air-handoff.mjs SEALED WORK FRESH_OUT');

const run=promisify(execFile);
const bytes=file=>fs.readFile(file);
const json=async file=>JSON.parse(await bytes(file));
const write=(file,value)=>fs.writeFile(file,JSON.stringify(value,null,2)+'\n',{flag:'wx'});
const sha=buffer=>createHash('sha256').update(buffer).digest('hex');
const pin=async file=>sha(await bytes(file));
const load=file=>import(pathToFileURL(file).href);
const exists=async file=>fs.lstat(file).then(()=>true,error=>{
  if(error.code==='ENOENT') return false;
  throw error;
});
const inside=(root,file)=>{
  const relative=path.relative(root,file);
  return !path.isAbsolute(relative) && relative!=='..' && !relative.startsWith('..'+path.sep);
};
async function resolvedTarget(argument) {
  const target=path.resolve(argument), parent=path.dirname(target);
  const resolved=await fs.realpath(parent);
  assert(target!==parent && path.relative(parent,resolved)==='',`Use a real output parent: ${resolved}`);
  if(await exists(target)) assert(path.relative(target,await fs.realpath(target))==='',`Use the real path for ${target}`);
  return target;
}

const [sealed,work,out]=await Promise.all([fs.realpath(sealedArg),resolvedTarget(workArg),resolvedTarget(outArg)]);
for(const [left,right] of [[sealed,work],[sealed,out],[work,out]])
  assert(!inside(left,right) && !inside(right,left),'Use three independent directories.');
assert(!(await exists(out)),'FRESH_OUT already exists.');
// In a managed checkout, both writable destinations belong to the production project.
for(let dir=path.dirname(fileURLToPath(import.meta.url));dir!==path.dirname(dir);dir=path.dirname(dir)) {
  if(!(await exists(path.join(dir,'scripts/company-platform/local-workspace.ps1')))) continue;
  const allowed=['output','company-workspace/production-trials'].map(folder=>path.join(dir,folder));
  for(const target of [work,out]) assert(allowed.some(folder=>folder!==target && inside(folder,target)),
    `Keep the receiver in this project's output or production-trials directory: ${target}`);
  break;
}

const source=path.join(work,'source'), prototype=path.join(source,'prototype');
const tools=path.join(source,'scripts','company-platform');
const manifestName='transfer-manifest.json', airSource='assets-source/company-floor-air-v1';
const recipe=airSource+'/examples/fifth-tower.json';
const home='air-home', rental='air-rental', deviceId=rental+'/ground/live/air';
const newRef={id:'floor-air-tower-wide',version:1};
const named=(root,key,...parts)=>path.join(root,'data','rooms',key,...parts);
const participant=doc=>{
  const device=doc.nodes.find(node=>node.id===deviceId);
  assert(device,`Missing ${deviceId}`);
  return device;
};
const report={status:'running',sealed,work,commands:[]};
const temp=path.join(out,'tmp'), cache=path.join(out,'npm-cache');
const childEnv={...process.env,TMP:temp,TEMP:temp,TMPDIR:temp};

async function invoke(label,cwd,entry,args,{failure=false,format='json',command=process.execPath}={}) {
  const item={label,cwd,command,entry,args};
  report.commands.push(item);
  let stdout,stderr;
  try {
    ({stdout,stderr}=await run(command,[...(entry ? [entry] : []),...args],
      {cwd,env:childEnv,windowsHide:true,timeout:240_000,maxBuffer:8*1024*1024}));
    item.exit=0;
  } catch(error) {
    ({stdout,stderr}=error);
    item.exit=error.code;
    if(error.signal) item.signal=error.signal;
  }
  await Promise.all([['stdout',stdout],['stderr',stderr]].map(([stream,value])=>
    fs.writeFile(path.join(out,label+'.'+stream+'.log'),value??'',{flag:'wx'})));
  assert.equal(item.exit,failure?1:0,label+'\n'+(stderr||stdout||''));
  item.response=format==='json'?JSON.parse(failure?stderr:stdout):stdout.trim();
  return item.response;
}

async function verify(root,expectedPin,label) {
  const result=await invoke(label,root,'verify.mjs',[root,expectedPin]);
  assert.equal(result.ok,true);
  assert.equal(result.manifestSha256,expectedPin);
  assert.equal(result.checkedFiles,result.declaredFiles);
  return result;
}

async function installLocked() {
  let entry=null, command='npm';
  if(process.platform==='win32') {
    const npmCli=path.join('node_modules','npm','bin','npm-cli.js');
    const paths=[process.env.npm_execpath,path.join(path.dirname(process.execPath),npmCli),
      ...(process.env.PATH??'').split(path.delimiter).filter(Boolean).map(dir=>path.join(dir,npmCli))];
    for(const candidate of paths) if(candidate && candidate.endsWith('npm-cli.js') && await exists(candidate)) {
      entry=candidate;
      break;
    }
    assert(entry,'Resolve npm-cli.js from an installed Node.js distribution.');
    command=process.execPath;
  }
  await invoke('npm-ci',prototype,entry,['ci','--cache',cache,'--no-audit','--no-fund'],{command,format:'text'});
  const lock=await json(path.join(prototype,'package-lock.json'));
  for(const name of ['three','vite','pngjs','jpeg-js']) {
    const {version}=await json(path.join(prototype,'node_modules',name,'package.json'));
    assert.equal(version,lock.packages['node_modules/'+name].version);
  }
  report.lockSha256=await pin(path.join(prototype,'package-lock.json'));
}

const edit=(label,args)=>invoke(label,work,'edit.mjs',args);
async function validate(label,file,expected) {
  const result=await edit(label,['validate',file]);
  assert.deepEqual([result.ok,result.id,result.revision],[true,expected.id,expected.revision]);
  assert.deepEqual((await json(file)).document,expected);
}

function near(actual,expected) {
  assert(Math.abs(actual-expected)<1e-6,`${actual} differs from ${expected}`);
}

async function inspectModel(packageRoot,manifest,document) {
  const company=path.join(prototype,'src','company');
  const [T,{deriveCompany},{createCompanyScene},{createCompanyAssetLibrary},{installNodeImageDecodeShim},catalog,templates]=await Promise.all([
    load(path.join(prototype,'node_modules','three','build','three.module.js')),load(path.join(company,'document.js')),
    load(path.join(company,'render.js')),load(path.join(company,'asset-library.js')),load(path.join(tools,'preflight-library-assets.mjs')),
    json(path.join(packageRoot,'source','prototype',manifest.runtimeInputs.catalog)),
    json(path.join(packageRoot,'source','prototype',manifest.runtimeInputs.templates)),
  ]);
  installNodeImageDecodeShim();
  const viewer=path.join(packageRoot,'viewer');
  const readAssets=new Map();
  const library=createCompanyAssetLibrary({fetchImpl:async url=>{
    assert(url.startsWith('/company-assets/'),`Unexpected asset ${url}`);
    const model=path.resolve(viewer,'.'+url);
    assert(inside(viewer,model));
    const data=await bytes(model);
    readAssets.set(url,sha(data));
    return {ok:true,arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)};
  }});
  let scene;
  try {
    const derived=deriveCompany(document,catalog,templates), floorId=derived.floorIds.get(deviceId);
    const objects=[...derived.facilities,...derived.surfaceFinishes].filter(item=>item.floorId===floorId);
    await library.preload(objects.map(item=>item.resource));
    scene=createCompanyScene(new T.Scene(),document,{catalog,templates,visibleFloorId:floorId,assetLibrary:library,mirrorPreflight:()=>{}});
    scene.root.updateMatrixWorld(true);
    const {resource}=objects.find(item=>item.id===deviceId), {state,parentId}=participant(document);
    assert.equal(readAssets.get(resource.asset.url),resource.asset.sha256,'The installed model must come from the package viewer.');
    const device=scene.root.getObjectByName(deviceId), floor=scene.root.getObjectByName('Floor:'+parentId);
    assert.equal(device?.parent?.name,parentId);
    assert(floor?.isMesh);
    const position=device.getWorldPosition(new T.Vector3()), world=derived.worlds.get(deviceId);
    position.toArray().forEach((value,i)=>near(value,world.position[i]));
    const forward=new T.Vector3(0,0,1).applyQuaternion(device.getWorldQuaternion(new T.Quaternion()));
    forward.toArray().forEach((value,i)=>near(value,[Math.sin(world.yaw),0,Math.cos(world.yaw)][i]));

    const foot=device.getObjectByName('weighted-foot');
    assert(foot?.isMesh,'The actual GLB weighted foot must be present.');
    const bottom=new T.Box3().setFromObject(foot).min.y;
    near(bottom,position.y);
    const floorRay=new T.Raycaster(position.clone().add(new T.Vector3(0,.025,0)),new T.Vector3(0,-1,0),0,.05);
    const [hit]=floorRay.intersectObject(floor,false);
    assert(hit,'Expect real floor under the base.');
    near(hit.point.y,bottom);
    const footVertices=foot.geometry.getAttribute('position');
    const idx=foot.geometry.index, triangle=new T.Triangle();
    let contactArea=0;
    for(let offset=0;offset<(idx?.count??footVertices.count);offset+=3) {
      for(const [i,vertex] of [triangle.a,triangle.b,triangle.c].entries())
        vertex.fromBufferAttribute(footVertices,idx?idx.getX(offset+i):offset+i).applyMatrix4(foot.matrixWorld);
      if([triangle.a,triangle.b,triangle.c].every(vertex=>Math.abs(vertex.y-bottom)<1e-6)) contactArea+=triangle.getArea();
    }
    assert(contactArea>.1,'The fixed foot needs a positive floor contact patch.');

    const indicators=Object.entries(resource.display).map(([key,mapping],index)=>{
      const mesh=device.getObjectByName(mapping.nodes[0]);
      assert(mesh?.isMesh && mesh.visible && mesh.geometry.getAttribute('position').count>=3);
      const expected=state.on && index<=state.speed;
      assert.equal(mesh.material.color.getHexString(),(expected?mapping.onColor:mapping.offColor).slice(1).toLowerCase(),key);
      const emissive=mesh.material.emissive.getHexString(), intensity=mesh.material.emissiveIntensity;
      assert.equal(emissive,expected?mapping.emissive.slice(1).toLowerCase():'000000',key);
      assert.equal(intensity,expected?mapping.onIntensity:0,key);
      return {key,name:mesh.name,emissive,intensity};
    });
    assert.deepEqual(indicators.map(item=>item.key),['power','speed1','speed2','speed3']);

    const variant=device.getObjectByName('transverse-vanes');
    let vanes=null;
    if(resource.id===newRef.id) {
      assert(variant?.isMesh && !device.getObjectByName('air-rotor'));
      const pos=variant.geometry.getAttribute('position'), index=variant.geometry.index;
      const vanePositions=new Set(Array.from({length:pos.count},(_,i)=>pos.getY(i).toFixed(6)));
      const bounds=new T.Box3().setFromBufferAttribute(pos);
      vanes={count:(index?.count??pos.count)/36,width:bounds.max.x-bounds.min.x};
      assert.equal(vanes.count,21);
      assert.equal(vanePositions.size,4*vanes.count,'Each vane should have its own four height levels.');
      near(vanes.width,.285-.038);
    }
    return {asset:resource.asset,ref:participant(document).resource,state,vanes,indicators,
      placement:{parentId,position:position.toArray(),forward:forward.toArray(),bottom,contactArea,
        footGeometrySha256:sha(Buffer.from(footVertices.array.buffer,footVertices.array.byteOffset,footVertices.array.byteLength))}};
  } finally {
    scene?.dispose();
    library.dispose();
  }
}

async function main() {
  const originalPath=path.join(sealed,manifestName), original=await json(originalPath), originalPin=await pin(originalPath);
  report.original=await verify(sealed,originalPin,'verify-original');
  if(!(await exists(work))) {
    await fs.mkdir(work);
    await fs.cp(sealed,work,{recursive:true,force:false,errorOnExist:true});
  }
  report.workingCopy=await verify(work,originalPin,'verify-pristine-copy');
  await installLocked();
  const defaultModels=await invoke('reproduce-four-original-models',source,path.join(tools,'build-floor-air.mjs'),['--check']);
  assert.equal(defaultModels.status,'passed');
  assert.deepEqual(defaultModels.resources.map(({id,version})=>[id,version]),
    ['tower','pedestal','circulator','purifier'].map(name=>['floor-air-'+name,1]));
  report.originalModels=defaultModels.resources;
  const rentalInput=named(work,rental,'save.json'), homeInput=named(work,home,'save.json');
  const {document:before}=await json(rentalInput), {document:originalHome}=await json(homeInput);
  assert.deepEqual(participant(before).state,{on:true,speed:3});
  report.originalModel=await inspectModel(sealed,original,before);

  const publish=(label,flag,input=recipe,failure=false)=>invoke(label,source,path.join(tools,'publish-room-appearance.mjs'),[flag,input],{failure});
  const publication=await publish('publish-fifth-tower','--publish');
  assert.deepEqual([publication.status,publication.family,publication.items.length],['published','floor-air',1]);
  const [registered]=publication.items;
  assert.deepEqual({id:registered.id,version:registered.version},newRef);
  const check=await publish('reproduce-fifth-tower','--check');
  assert.deepEqual(check,{...publication,status:'unchanged'});
  const resourceFile=path.join(source,registered.resourcePath), variant=await json(resourceFile);
  const modelPath=path.join(prototype,'public',variant.asset.url.slice(1));
  const protectedFiles=[resourceFile,modelPath,path.join(source,publication.sourceParameters),
    path.join(prototype,original.runtimeInputs.catalog),path.join(tools,'library-inputs.json')];
  const protectedPins=await Promise.all(protectedFiles.map(pin));
  assert.equal(protectedPins[1],registered.sha256);
  report.variant={...registered,recipe,recipeSha256:publication.sourceParametersSha256,modelUrl:variant.asset.url};

  const editedRecipe=await json(path.join(source,recipe));
  editedRecipe.designs[0].bodyWidth=.279;
  const invalidRecipe=airSource+'/examples/handoff-version-conflict.json';
  await write(path.join(out,'rejected-recipe.json'),editedRecipe);
  await write(path.join(source,invalidRecipe),editedRecipe);
  try {
    const failure=await publish('reject-altered-v1','--publish',invalidRecipe,true);
    assert.deepEqual(failure,{code:'appearance-version-conflict',message:newRef.id+'@1'});
    report.negative={...failure,protectedFiles:protectedFiles.map(file=>path.relative(work,file))};
  } finally {
    await fs.unlink(path.join(source,invalidRecipe));
  }
  assert.deepEqual(await Promise.all(protectedFiles.map(pin)),protectedPins);

  const ops=path.join(out,'replace-and-switch-off.ops.json'), edited=path.join(out,'rental-edited');
  await write(ops,[{type:'replace-resource',id:deviceId,resource:newRef},{type:'set-state',id:deviceId,state:{on:false,speed:2}}]);
  assert.equal((await edit('replace-and-switch-off',['apply',rentalInput,ops,edited])).ok,true);
  const expected=structuredClone(before);
  expected.revision++;
  Object.assign(participant(expected),{resource:newRef,state:{on:false,speed:2}});
  const editedSave=path.join(edited,'save.json');
  await validate('validate-rental-edit',editedSave,expected);

  await invoke('check-registered-library',source,path.join(tools,'build-library.mjs'),['--check'],{format:'text'});
  const build=await invoke('build-viewer-identity',prototype,path.join(prototype,'scripts','build-company-id.mjs'),[],{format:'text'});
  assert.match(build,/^[a-f0-9]{12}$/);
  assert.notEqual(build,original.buildId);
  await invoke('build-viewer',prototype,path.join(prototype,'node_modules','vite','bin','vite.js'),
    ['build','--config','vite.company.config.js'],{format:'text'});
  const dist=path.join(prototype,'dist-company'), derivative=path.join(out,'derived-package');
  const sourceDefault=path.join(work,'data','save.json');
  const changedDefault=isDeepStrictEqual((await json(sourceDefault)).document,before);
  const packaged=await invoke('package-both-rooms',work,path.join(tools,'package-company.mjs'),[
    dist,build,changedDefault?editedSave:sourceDefault,derivative,'--source',source,
    '--room',home,named(work,home,'batch-result'),'--room',rental,editedSave,
  ]);
  assert.deepEqual([packaged.ok,packaged.rooms],[true,[home,rental]]);
  const manifestPath=path.join(derivative,manifestName), derivedPin=await pin(manifestPath), derived=await json(manifestPath);
  report.derived=await verify(derivative,derivedPin,'verify-derived');
  const retained=original.files.filter(file=>file.path.startsWith('data/rooms/'+home+'/'));
  assert(retained.length>=6,'Expected the named home save and its batch artifacts.');
  for(const file of retained) assert.equal(await pin(path.join(derivative,file.path)),file.sha256,file.path);
  report.retainedHomeFiles=retained.length;
  const packedRental=named(derivative,rental,'save.json');
  const offSavePin=await pin(packedRental);
  // Packaging serializes saves canonically. Compare the entire edited envelope,
  // including the dependency pins, and preserve original home bytes separately.
  assert.deepEqual(await json(packedRental),await json(editedSave));
  report.editedSave={beforePackagingSha256:await pin(editedSave),packagedSha256:offSavePin};
  await validate('cold-validate-off-rental',packedRental,expected);
  await validate('cold-validate-original-home',named(derivative,home,'save.json'),originalHome);
  const packedDefault=path.join(derivative,'data','save.json');
  if(changedDefault) assert.deepEqual(await json(packedDefault),await json(editedSave));
  else assert.equal(await pin(packedDefault),await pin(sourceDefault));
  assert.equal(await pin(path.join(derivative,'viewer',variant.asset.url.slice(1))),registered.sha256);
  report.powerOff=await inspectModel(derivative,derived,(await json(packedRental)).document);

  const switchOps=path.join(out,'restore-power.ops.json'), switched=path.join(out,'rental-restored');
  await write(switchOps,[{type:'set-state',id:deviceId,state:{on:true}}]);
  assert.equal((await edit('restore-power-on-cold-save',['apply',packedRental,switchOps,switched])).ok,true);
  expected.revision++;
  participant(expected).state.on=true;
  const restored=path.join(switched,'save.json');
  await validate('cold-validate-restored-rental',restored,expected);
  report.powerRestored=await inspectModel(derivative,derived,(await json(restored)).document);
  assert.deepEqual(report.powerRestored.placement,report.powerOff.placement);
  const {footGeometrySha256,position,forward,parentId}=report.originalModel.placement;
  assert.deepEqual({footGeometrySha256,position,forward,parentId},Object.fromEntries(
    ['footGeometrySha256','position','forward','parentId'].map(key=>[key,report.powerOff.placement[key]])));
  near(report.powerOff.placement.contactArea,report.originalModel.placement.contactArea);
  assert.deepEqual(report.powerOff.indicators.map(item=>item.intensity),[0,0,0,0]);
  assert.deepEqual(report.powerRestored.indicators.map(item=>item.intensity),[1,1,1,0]);
  assert.equal(await pin(packedRental),offSavePin);
  assert.equal(await pin(path.join(work,manifestName)),originalPin);
  await verify(sealed,originalPin,'verify-original-after-work');
  await verify(derivative,derivedPin,'verify-derived-after-cold-read');
  report.status='passed';
}

await fs.mkdir(out);
await fs.mkdir(temp);
try {
  await main();
  console.log(JSON.stringify({status:report.status,report:path.join(out,'report.json')},null,2));
} catch(error) {
  report.status='failed';
  report.error={message:error.message,stack:error.stack};
  console.error(error);
  process.exitCode=1;
} finally {
  await write(path.join(out,'report.json'),report);
}
