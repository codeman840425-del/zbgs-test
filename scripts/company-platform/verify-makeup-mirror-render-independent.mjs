import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import * as THREE from '../../prototype/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../prototype/node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import {createMirrorBindings,createMirrorController,mirrorResourceSnapshot} from '../../prototype/src/company/mirror-render.js';
import {createMakeupMirrorSample} from '../../prototype/src/company/makeup-mirror-samples.js';
import {deriveCompany} from '../../prototype/src/company/document.js';
import {createCompanyScene} from '../../prototype/src/company/render.js';
import {createCompanyAssetLibrary} from '../../prototype/src/company/asset-library.js';

const output=path.resolve(process.argv[2]||'evidence/company-makeup-mirror-render-independent-v1');
const runDirectory=path.join(output,`run-${new Date().toISOString().replace(/[:.]/g,'-')}`);
await fs.mkdir(runDirectory,{recursive:true});
const directory='prototype/public/company-assets/makeup-mirror-v1/tri-fold/v1';
const resource=JSON.parse(await fs.readFile(`${directory}/resource.json`,'utf8'));
const bytes=await fs.readFile(`${directory}/model.glb`),checks=[];

// This small public-state renderer substitute calls the real r187 Reflector.
// It deliberately provides no shader compilation or framebuffer evidence.
function rendererDouble() {
  let target=null,viewport=new THREE.Vector4(0,0,800,800),scissor=viewport.clone(),scissorTest=false;
  const programs=new Map();
  const gl={SCISSOR_BOX:1,SCISSOR_TEST:2,SAMPLES:3,FRAMEBUFFER:4,FRAMEBUFFER_COMPLETE:5,
    isContextLost:()=>false,getError:()=>0,checkFramebufferStatus:()=>5,
    getParameter(key){return key===1?scissor.toArray():key===2?scissorTest:target?.samples||0;}};
  const renderer={xr:{enabled:false},shadowMap:{autoUpdate:true},autoClear:true,debug:{onShaderError:null,checkShaderErrors:false},
    calls:0,info:{autoReset:false,render:{calls:0,triangles:0}},properties:{get:material=>programs.get(material)},
    compile(object){programs.set(object.material,{currentProgram:{getUniforms(){renderer.onCompile?.(object);return {};}}});},
    state:{buffers:{depth:{setMask(){}}},viewport(v){viewport.copy(v);},scissor(v){scissor.copy(v);},setScissorTest(v){scissorTest=v;}},
    getContext:()=>gl,getRenderTarget:()=>target,getActiveCubeFace:()=>0,getActiveMipmapLevel:()=>0,getCurrentViewport:v=>v.copy(viewport),
    setRenderTarget(next){target=next;},clear(){},
    render(world,camera){this.calls++;this.info.render.calls++;this.onDraw?.(world,camera);}};
  return renderer;
}

async function fixture() {
  const world=new THREE.Scene(),camera=new THREE.PerspectiveCamera(50,1,.05,50),controller=createMirrorController({maxFacesPerMirror:3});
  const renderer=rendererDouble(),groups=[];
  camera.position.set(0,.365,3);camera.lookAt(0,.365,0);camera.updateMatrixWorld(true);
  async function add(id) {
    const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const parts=new Map();scene.traverse(node=>{if(node.name)parts.set(node.name,node);});world.add(scene);
    const group={id,scene,bindings:createMirrorBindings(resource,parts,id)};groups.push(group);return group;
  }
  return {world,camera,controller,renderer,groups,add,
    update(group,frameId,timeMs){return controller.update(group.bindings,renderer,world,camera,{frameId,timeMs});},
    preflight(group,frameId=1,timeMs=0){return controller.preflight(group.bindings,renderer,world,camera,{frameId,timeMs});},
    dispose(){controller.dispose();for(const group of groups)for(const binding of group.bindings)binding.dispose();for(const group of groups)group.scene.traverse(node=>{node.geometry?.dispose();for(const m of [node.material].flat().filter(Boolean))m.dispose();});world.clear();}};
}

async function check(name, action) {
  const f=await fixture();let detail;
  try { detail=await action(f);checks.push({name,status:'passed',detail}); }
  catch(error) {checks.push({name,status:'failed',detail:error.detail||detail,error:{code:error.code,message:error.message,stack:error.stack}});}
  finally {f.dispose();assert.equal(mirrorResourceSnapshot().live,0,'Independent fixture cleanup must release all targets');}
}

await check('candidate failure after prior preflight-only commit preserves old target identities',async f=>{
  const old=await f.add('same-owner');f.preflight(old);const targets=old.bindings.map(b=>b.reflector.getRenderTarget());
  const next=await f.add('same-owner');let compiles=0;
  f.renderer.onCompile=()=>{if(++compiles===3)f.renderer.debug.onShaderError();};
  assert.throws(()=>f.preflight(next),error=>error.code==='mirror-shader-failed');
  assert.deepEqual(old.bindings.map(b=>b.reflector.getRenderTarget()),targets);assert(next.bindings.every(b=>!b.active));
  assert.equal(mirrorResourceSnapshot().live,3);return {failedPanel:3,retainedTargetIdentities:3};
});

await check('discarded warmed candidate leaves current owner and no ghost candidate targets',async f=>{
  const old=await f.add('same-owner');f.update(old,1,0);const targets=old.bindings.map(b=>b.reflector.getRenderTarget());
  const next=await f.add('same-owner');f.preflight(next);assert.equal(mirrorResourceSnapshot().live,6);
  for(const binding of next.bindings)binding.dispose();
  assert.equal(mirrorResourceSnapshot().live,3);assert.deepEqual(old.bindings.map(b=>b.reflector.getRenderTarget()),targets);
  const result=f.update(old,2,34);assert.equal(result.faceCount,3);assert.equal(result.stats.candidateFaceCount,0);
  return {currentFaces:3,liveAfterDiscard:3};
});

await check('owner release callback cannot reenter update and orphan another owner',async f=>{
  const old=await f.add('old'),next=await f.add('next'),nested=await f.add('nested');f.update(old,1,0);
  let invoked=false,nestedResult;
  const parent=old.bindings[0].reflector.parent;
  parent.addEventListener('childremoved',event=>{
    if(invoked||!event.child.isReflector)return;invoked=true;nestedResult=f.update(nested,99,1000);
  });
  const result=f.update(next,2,34),snapshot=f.controller.snapshot();
  const observed={nestedReason:nestedResult?.reason,nestedUpdated:nestedResult?.updated,outerReason:result.reason,
    controller:snapshot,owners:f.groups.map(g=>({id:g.id,active:g.bindings.filter(b=>b.active).length}))};
  try {
    assert.equal(nestedResult?.reason,'reflection-pass-guard');
    assert(nested.bindings.every(b=>!b.active),'A reentrant unselected owner must have no targets');
    assert.equal(mirrorResourceSnapshot().live,result.faceCount,'Every live target must belong to the current owner');
  }catch(error){error.detail=observed;throw error;}
  return observed;
});

await check('subset group rejection retains a previously warmed candidate for later discard',async f=>{
  const old=await f.add('old'),candidate=await f.add('candidate');f.update(old,1,0);f.preflight(candidate);
  const oldTargets=old.bindings.map(b=>b.reflector.getRenderTarget()),candidateTargets=candidate.bindings.map(b=>b.reflector.getRenderTarget());
  assert.throws(()=>f.controller.preflight(candidate.bindings.slice(0,2),f.renderer,f.world,f.camera,{frameId:2,timeMs:34}),e=>e.code==='mirror-incomplete-group');
  assert.deepEqual(old.bindings.map(b=>b.reflector.getRenderTarget()),oldTargets);
  assert.deepEqual(candidate.bindings.map(b=>b.reflector.getRenderTarget()),candidateTargets);
  for(const b of candidate.bindings)b.dispose();assert.equal(mirrorResourceSnapshot().live,3);
  return {subsetRefused:true,currentFaces:3};
});

await check('candidate release callback cannot bypass six-target handoff bound',async f=>{
  const old=await f.add('old'),first=await f.add('first-candidate'),next=await f.add('next-candidate'),nested=await f.add('nested-candidate');
  f.update(old,1,0);f.preflight(first);
  let invoked=false,nestedError,nestedResult;
  first.bindings[0].reflector.parent.addEventListener('childremoved',event=>{
    if(invoked||!event.child.isReflector)return;invoked=true;
    try{nestedResult=f.preflight(nested,2,34);}catch(error){nestedError=error.code;}
  });
  f.preflight(next,2,34);
  const observed={nestedError,nestedUpdated:nestedResult?.updated,live:mirrorResourceSnapshot().live,controller:f.controller.snapshot(),
    owners:f.groups.map(g=>({id:g.id,active:g.bindings.filter(b=>b.active).length}))};
  try{
    assert.equal(nestedError,'mirror-preflight-reentrant');
    assert(nested.bindings.every(b=>!b.active));assert.equal(mirrorResourceSnapshot().live,6);
  }catch(error){error.detail=observed;throw error;}
  return observed;
});

await check('retry after failed real scene preflight cannot publish a disposed candidate',async f=>{
  const catalog=JSON.parse(await fs.readFile('prototype/src/company/library-catalog.json','utf8'));
  const templates=JSON.parse(await fs.readFile('prototype/src/company/templates-extended.json','utf8'));
  const document=createMakeupMirrorSample(catalog,templates,{index:3}).document;
  const library=createCompanyAssetLibrary({fetchImpl:async url=>{const data=await fs.readFile(`prototype/public${url}`);return {ok:true,arrayBuffer:async()=>data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)};}});
  await library.preload(deriveCompany(document,catalog,templates).facilities.map(facility=>facility.resource));
  let rejectThird=false,scene,handle;
  const preflight=({mirrors})=>{
    f.world.updateMatrixWorld(true);
    const binding=mirrors[0],parent=binding.surface.parent;
    const point=parent.localToWorld(new THREE.Vector3(...binding.planePosition));
    const normal=new THREE.Vector3(Math.sin(binding.planeYaw),0,Math.cos(binding.planeYaw)).transformDirection(parent.matrixWorld);
    f.camera.position.copy(point).addScaledVector(normal,3);f.camera.lookAt(point);f.camera.updateMatrixWorld(true);
    let compiled=0;
    f.renderer.onCompile=rejectThird?()=>{if(++compiled===3)f.renderer.debug.onShaderError();}:null;
    return f.controller.preflight(mirrors,f.renderer,f.world,f.camera,{frameId:1,timeMs:0});
  };
  try{
    scene=createCompanyScene(f.world,document,{catalog,templates,assetLibrary:library,mirrorPreflight:preflight});
    const oldRoot=scene.root,oldDocument=scene.save();
    handle=scene.prepareChange([{type:'set-state',id:'vanity/primary/mirror',state:{intensity:6}}]);
    rejectThird=true;
    assert.throws(()=>scene.commit(handle),error=>error.code==='mirror-shader-failed');
    assert.equal(scene.root,oldRoot);assert.equal(scene.save(),oldDocument);
    rejectThird=false;
    let retryError;try{scene.commit(handle);}catch(error){retryError=error.code;}
    const observed={retryError,rootRetained:scene.root===oldRoot,documentRetained:scene.save()===oldDocument,
      bindings:scene.mirrorBindings().map(binding=>binding.snapshot()),targets:mirrorResourceSnapshot()};
    try{
      if(retryError){assert.equal(scene.root,oldRoot);assert.equal(scene.save(),oldDocument);}
      else assert(scene.mirrorBindings().every(binding=>!binding.disposed&&binding.active&&binding.fresh),'Successful retry must publish live validated bindings');
    }catch(error){error.detail=observed;throw error;}
    return observed;
  }finally{if(handle)scene?.discard(handle);scene?.dispose();library.dispose();}
});

const sourceHashes={};for(const filename of ['prototype/src/company/mirror-render.js','prototype/src/company/render.js','scripts/company-platform/verify-makeup-mirror-render-independent.mjs'])sourceHashes[filename]=createHash('sha256').update(await fs.readFile(filename)).digest('hex');
const report={status:checks.every(c=>c.status==='passed')?'passed':'failed',checks,sourceHashes,
  actualAssetSha256:createHash('sha256').update(bytes).digest('hex'),resources:mirrorResourceSnapshot(),
  limitations:['Independent CPU lifecycle checks use actual production GLBs and the real locked Three Reflector with a renderer substitute. They do not establish GPU shader/framebuffer correctness, browser rendering or performance.']};
await fs.writeFile(path.join(runDirectory,'report.json'),JSON.stringify(report,null,2)+'\n');
await fs.writeFile(path.join(output,'latest.json'),JSON.stringify({status:report.status,report:path.relative(process.cwd(),path.join(runDirectory,'report.json')).replaceAll('\\','/')},null,2)+'\n');
console.log(JSON.stringify({status:report.status,checks:checks.map(c=>({name:c.name,status:c.status,error:c.error?.message,detail:c.status==='failed'?c.detail:undefined})),report:path.join(runDirectory,'report.json')},null,2));
if(report.status!=='passed')process.exitCode=1;
